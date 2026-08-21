export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // -----------------------------
    // IMPORT PRODUCT FROM URL
    // -----------------------------
    if (url.pathname === "/api/import-product" && request.method === "POST") {
      try {
        const body = await request.json();
        const productUrl = body.url?.trim();

        if (!productUrl) {
          return json({ error: "Product URL is required." }, 400);
        }

        let parsedUrl;

        try {
          parsedUrl = new URL(productUrl);
        } catch {
          return json({ error: "That doesn't look like a valid URL." }, 400);
        }

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          return json({ error: "Only normal web URLs are allowed." }, 400);
        }

        const response = await fetch(productUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 KeyCache Product Importer"
          }
        });

        if (!response.ok) {
          return json({
            success: false,
            blocked: true,
            message:
              "This supplier would not allow KeyCache to read the page automatically.",
            data: {
              supplierName: supplierFromHostname(parsedUrl.hostname),
              url: productUrl
            }
          });
        }

        const html = await response.text();

        const title =
          getMeta(html, "property", "og:title") ||
          getMeta(html, "name", "twitter:title") ||
          getTitle(html) ||
          "";

        const price =
          getMeta(html, "property", "product:price:amount") ||
          extractJsonLdValue(html, "price") ||
          "";

        let stock =
          extractJsonLdValue(html, "availability") ||
          "";

        if (stock.includes("InStock")) {
          stock = "In stock";
        } else if (stock.includes("OutOfStock")) {
          stock = "Out of stock";
        }

        const sku =
          extractJsonLdValue(html, "sku") ||
          "";

        const condition =
          extractJsonLdValue(html, "itemCondition") ||
          "";

        return json({
          success: true,
          data: {
            title: cleanText(title),
            supplierName: supplierFromHostname(parsedUrl.hostname),
            supplierProductId: cleanText(sku),
            conditionType: cleanCondition(condition),
            price: price ? Number(price) : "",
            stockStatus: stock,
            url: productUrl
          }
        });

      } catch (error) {
        return json({
          error: "Import failed.",
          details: error.message
        }, 500);
      }
    }


    // -----------------------------
    // SAVE PRODUCT TO D1
    // -----------------------------
    if (url.pathname === "/api/products" && request.method === "POST") {
      try {
        const data = await request.json();

        if (!data.title || !data.supplierName || !data.url) {
          return json({
            error:
              "Product title, supplier name, and product URL are required."
          }, 400);
        }

        const slug = createSlug(
          [
            data.vehicle,
            data.years,
            data.fccId,
            data.title
          ]
            .filter(Boolean)
            .join(" ")
        );

        await env.DB.prepare(`
          INSERT INTO products (
            slug,
            title,
            vehicle,
            years,
            frequency,
            chip_id,
            button_configuration,
            fcc_id,
            oem_part,
            buttons,
            remote_start,
            notes,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)

          ON CONFLICT(slug) DO UPDATE SET
            title = excluded.title,
            vehicle = excluded.vehicle,
            years = excluded.years,
            frequency = excluded.frequency,
            chip_id = excluded.chip_id,
            button_configuration = excluded.button_configuration,
            fcc_id = excluded.fcc_id,
            oem_part = excluded.oem_part,
            buttons = excluded.buttons,
            remote_start = excluded.remote_start,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
        `)
          .bind(
            slug,
            data.title || "",
            data.vehicle || "",
            data.years || "",
            data.frequency || "",
            data.chipId || "",
            data.buttonConfiguration || "",
            data.fccId || "",
            data.oemPart || "",
            data.buttons || "",
            data.remoteStart ? 1 : 0,
            data.notes || ""
          )
          .run();

        const product = await env.DB.prepare(`
          SELECT id
          FROM products
          WHERE slug = ?
        `)
          .bind(slug)
          .first();

        if (!product) {
          throw new Error("Product could not be found after saving.");
        }

        await env.DB.prepare(`
          INSERT INTO supplier_listings (
            product_id,
            supplier_name,
            supplier_product_id,
            condition_type,
            price,
            stock_status,
            shipping,
            url,
            affiliate_url,
            last_checked,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `)
          .bind(
            product.id,
            data.supplierName || "",
            data.supplierProductId || "",
            data.conditionType || "",
            data.price || null,
            data.stockStatus || "",
            data.shipping || "",
            data.url,
            data.affiliateUrl || "",
            new Date().toISOString().slice(0, 10)
          )
          .run();

        return json({
          success: true,
          message: "Product saved to KeyCache.",
          productId: product.id
        });

      } catch (error) {
        return json({
          error: "Unable to save product.",
          details: error.message
        }, 500);
      }
    }


    // -----------------------------
    // QUICK API TEST
    // -----------------------------
    if (url.pathname === "/api/health") {
      return json({
        success: true,
        message: "KeyCache API is alive."
      });
    }

    // -----------------------------
// SEARCH PRODUCTS
// -----------------------------
if (url.pathname === "/api/search" && request.method === "GET") {
  try {
    const query = (url.searchParams.get("q") || "").trim();

    if (!query) {
      return json({ products: [] });
    }

    const search = `%${query}%`;

    const results = await env.DB.prepare(`
      SELECT
        p.id,
        p.slug,
        p.title,
        p.vehicle,
        p.years,
        p.fcc_id,
        p.oem_part,
        p.buttons,
        p.remote_start,
        p.notes,

        s.supplier_name,
        s.supplier_product_id,
        s.condition_type,
        s.price,
        s.stock_status,
        s.shipping,
        s.url,
        s.affiliate_url,
        s.last_checked

      FROM products p

      LEFT JOIN supplier_listings s
        ON s.product_id = p.id

      WHERE
        p.title LIKE ?
        OR p.vehicle LIKE ?
        OR p.years LIKE ?
        OR p.fcc_id LIKE ?
        OR p.oem_part LIKE ?
        OR p.notes LIKE ?

      ORDER BY
        p.id DESC,
        s.price ASC
    `)
      .bind(
        search,
        search,
        search,
        search,
        search,
        search
      )
      .all();


    const products = {};

    for (const row of results.results) {

      if (!products[row.id]) {

        products[row.id] = {
          id: row.id,
          title: row.title,
          vehicle: row.vehicle,
          years: row.years,
          fccId: row.fcc_id,
          oemPart: row.oem_part,
          buttons: row.buttons,
          remoteStart: Boolean(row.remote_start),
          notes: row.notes,
          suppliers: []
        };

      }


      if (row.supplier_name) {

        products[row.id].suppliers.push({
          name: row.supplier_name,
          supplierProductId: row.supplier_product_id,
          type: row.condition_type,
          price: row.price,
          stock: row.stock_status,
          shipping: row.shipping,

          url:
            row.affiliate_url ||
            row.url,

          lastChecked:
            row.last_checked
        });

      }

    }


    return json({
      products: Object.values(products)
    });

  } catch (error) {

    return json({
      error: "Search failed.",
      details: error.message
    }, 500);

  }
}

    // -----------------------------
// LIST PRODUCTS FOR ADMIN
// -----------------------------
if (url.pathname === "/api/admin/products" && request.method === "GET") {
  try {
    const results = await env.DB.prepare(`
      SELECT
        p.id,
        p.slug,
        p.title,
        p.vehicle,
        p.years,
        p.fcc_id,
        p.oem_part,
        p.buttons,
        p.remote_start,
        p.notes,

        s.id AS listing_id,
        s.supplier_name,
        s.supplier_product_id,
        s.condition_type,
        s.price,
        s.stock_status,
        s.shipping,
        s.url,
        s.affiliate_url,
        s.last_checked

      FROM products p

      LEFT JOIN supplier_listings s
        ON s.product_id = p.id

      ORDER BY p.id DESC
    `).all();

    return json({
      success: true,
      products: results.results
    });

  } catch (error) {
    return json({
      error: "Unable to load products.",
      details: error.message
    }, 500);
  }
}


// -----------------------------
// UPDATE PRODUCT
// -----------------------------
if (url.pathname === "/api/admin/products" && request.method === "PUT") {
  try {
    const data = await request.json();

    if (!data.productId || !data.listingId) {
      return json({
        error: "Product ID and listing ID are required."
      }, 400);
    }

    await env.DB.prepare(`
      UPDATE products
      SET
        title = ?,
        vehicle = ?,
        years = ?,
        frequency = ?,
        chip_id = ?,
        button_configuration = ?,
        fcc_id = ?,
        oem_part = ?,
        buttons = ?,
        remote_start = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(
        data.title || "",
        data.vehicle || "",
        data.years || "",
        data.fccId || "",
        data.oemPart || "",
        data.buttons || "",
        data.remoteStart ? 1 : 0,
        data.notes || "",
        data.productId
      )
      .run();

    await env.DB.prepare(`
      UPDATE supplier_listings
      SET
        supplier_name = ?,
        supplier_product_id = ?,
        condition_type = ?,
        price = ?,
        stock_status = ?,
        shipping = ?,
        url = ?,
        affiliate_url = ?,
        last_checked = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(
        data.supplierName || "",
        data.supplierProductId || "",
        data.conditionType || "",
        data.price || null,
        data.stockStatus || "",
        data.shipping || "",
        data.url || "",
        data.affiliateUrl || "",
        new Date().toISOString().slice(0, 10),
        data.listingId
      )
      .run();

    return json({
      success: true,
      message: "Product updated."
    });

  } catch (error) {
    return json({
      error: "Unable to update product.",
      details: error.message
    }, 500);
  }
}


// -----------------------------
// DELETE PRODUCT
// -----------------------------
if (url.pathname === "/api/admin/products" && request.method === "DELETE") {
  try {
    const data = await request.json();

    const productId = Number(data.productId);

    if (!productId) {
      return json({
        error: "Product ID is required."
      }, 400);
    }

    await env.DB.prepare(`
      DELETE FROM supplier_listings
      WHERE product_id = ?
    `)
      .bind(productId)
      .run();

    await env.DB.prepare(`
      DELETE FROM products
      WHERE id = ?
    `)
      .bind(productId)
      .run();

    return json({
      success: true,
      message: "Product deleted."
    });

  } catch (error) {
    return json({
      error: "Unable to delete product.",
      details: error.message
    }, 500);
  }
}
    // -----------------------------
    // NORMAL WEBSITE FILES
    // -----------------------------
    return env.ASSETS.fetch(request);
  }
};


// =================================
// HELPER FUNCTIONS
// =================================

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}


function createSlug(text) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    "product-" + Date.now()
  );
}


function supplierFromHostname(hostname) {
  const host = hostname
    .replace(/^www\./, "")
    .toLowerCase();

  const suppliers = {
    "americankeysupply.com": "American Key Supply",
    "uhs-hardware.com": "UHS Hardware",
    "clksupplies.com": "CLK Supplies",
    "locksmithkeyless.com": "Locksmith Keyless",
    "transponderisland.com": "Transponder Island",
    "keyinnovations.com": "Key Innovations",
    "royalkeysupply.com": "Royal Key Supply",
    "securitysupplydirect.com": "Security Supply Direct"
  };

  return suppliers[host] || host;
}


function getMeta(html, attribute, value) {
  const patterns = [
    new RegExp(
      `<meta[^>]+${attribute}=["']${escapeRegex(value)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${escapeRegex(value)}["'][^>]*>`,
      "i"
    )
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return "";
}


function getTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1] : "";
}


function extractJsonLdValue(html, key) {
  const scripts = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  ];

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1].trim());
      const result = findKey(parsed, key);

      if (result !== undefined && result !== null) {
        return String(result);
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  return "";
}


function findKey(value, targetKey) {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (
    Object.prototype.hasOwnProperty.call(value, targetKey)
  ) {
    return value[targetKey];
  }

  for (const child of Object.values(value)) {
    if (typeof child === "object") {
      const result = findKey(child, targetKey);

      if (result !== undefined) {
        return result;
      }
    }
  }

  return undefined;
}


function cleanCondition(value) {
  if (!value) return "";

  return String(value)
    .replace("https://schema.org/", "")
    .replace("http://schema.org/", "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}


function cleanText(value) {
  if (!value) return "";

  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}


function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
