export default {
  async fetch(request, env) {
    const url = new URL(request.url);


    // =====================================================
    // LIVE SUPPLIER SEARCH PROTOTYPE
    // =====================================================

    if (
      url.pathname === "/api/live-search" &&
      request.method === "GET"
    ) {
      const query =
        (url.searchParams.get("q") || "").trim();

      const requestedMode =
  (
    url.searchParams.get("mode") ||
    ""
  ).toLowerCase();

const searchMode =
  requestedMode === "comparison"
    ? "comparison"
    : detectSearchMode(query);

      if (!query) {
        return json(
          {
            error: "Search query is required."
          },
          400
        );
      }


    const supplierConfigs = [
  {
    name: "Royal Key Supply",
    baseUrl: "https://royalkeysupply.com"
  },

  {
    name: "CLK Supplies",
    baseUrl: "https://www.clksupplies.com"
  }
];


      const supplierResults =
        await Promise.all(
          supplierConfigs.map(
            supplier =>
              searchSupplier(
                supplier,
                query
              )
          )
        );


      const products =
        supplierResults.flatMap(
          supplier =>
            supplier.products || []
        );


    // Put the strongest search matches first.
// Use price only to break ties.

products.sort((a, b) => {

  const scoreA =
    typeof a.matchScore === "number"
      ? a.matchScore
      : 0;

  const scoreB =
    typeof b.matchScore === "number"
      ? b.matchScore
      : 0;


  if (scoreB !== scoreA) {
    return scoreB - scoreA;
  }


  const priceA =
    typeof a.price === "number"
      ? a.price
      : Infinity;

  const priceB =
    typeof b.price === "number"
      ? b.price
      : Infinity;


  return priceA - priceB;
});


      return json({
        success: true,
        query,
        searchMode,

        prototype:
          "KEYCACHE_LIVE_SEARCH_V1",

        message:
          "Live supplier results. Nothing has been saved to D1.",

        suppliers:
          supplierResults.map(
            result => ({
              supplier:
                result.supplier,

              ok:
                result.ok,

              searchStatus:
                result.searchStatus,

              searchMs:
                result.searchMs,

              productsFound:
                result.products?.length || 0,

              error:
                result.error || null
            })
          ),

        products
      });
    }



    // =====================================================
    // IMPORT PRODUCT FROM SUPPLIER URL
    // =====================================================

    if (
      url.pathname === "/api/import-product" &&
      request.method === "POST"
    ) {
      try {
        const body =
          await request.json();

        const productUrl =
          body.url?.trim();


        if (!productUrl) {
          return json(
            {
              error:
                "Product URL is required."
            },
            400
          );
        }


        let parsedUrl;

        try {
          parsedUrl =
            new URL(productUrl);
        } catch {
          return json(
            {
              error:
                "That doesn't look like a valid URL."
            },
            400
          );
        }


        if (
          ![
            "http:",
            "https:"
          ].includes(
            parsedUrl.protocol
          )
        ) {
          return json(
            {
              error:
                "Only normal web URLs are allowed."
            },
            400
          );
        }


        const response =
          await fetchWithTimeout(
            productUrl,
            10000
          );


        if (!response.ok) {
          return json({
            success: false,
            blocked: true,

            message:
              "This supplier would not allow KeyCache to read the page automatically.",

            data: {
              supplierName:
                supplierFromHostname(
                  parsedUrl.hostname
                ),

              url:
                productUrl
            }
          });
        }


        const html =
          await response.text();


        const details =
          extractProductDetails(
            html,
            productUrl
          );


        return json({
          success: true,

          data: {
            title:
              details.title,

            supplierName:
              supplierFromHostname(
                parsedUrl.hostname
              ),

            supplierProductId:
              details.sku,

            conditionType:
              details.type,

            price:
              details.price,

            stockStatus:
              details.stock,

            url:
              productUrl
          }
        });

      } catch (error) {
        return json(
          {
            error:
              "Import failed.",

            details:
              error.message
          },
          500
        );
      }
    }



    // =====================================================
    // SAVE PRODUCT + SUPPLIER LISTING
    // =====================================================

    if (
      url.pathname === "/api/products" &&
      request.method === "POST"
    ) {
      try {
        const data =
          await request.json();


        if (
          !data.supplierName ||
          !data.url
        ) {
          return json(
            {
              error:
                "Supplier name and product URL are required."
            },
            400
          );
        }


        const existingProductId =
          Number(
            data.existingProductId
          ) || null;


        let product;


        // -------------------------------------------------
        // ATTACH TO EXISTING MASTER PRODUCT
        // -------------------------------------------------

        if (existingProductId) {

          product =
            await env.DB.prepare(`
              SELECT *
              FROM products
              WHERE id = ?
            `)
              .bind(
                existingProductId
              )
              .first();


          if (!product) {
            return json(
              {
                error:
                  "The selected KeyCache product no longer exists."
              },
              400
            );
          }

        } else {

          // -------------------------------------------------
          // CREATE NEW MASTER PRODUCT
          // -------------------------------------------------

          if (!data.title) {
            return json(
              {
                error:
                  "Product title is required when creating a new KeyCache product."
              },
              400
            );
          }


          const slug =
            createSlug(
              [
                data.vehicle,
                data.years,
                data.fccId,
                data.oemPart,
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

            VALUES (
              ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              CURRENT_TIMESTAMP
            )

            ON CONFLICT(slug)
            DO UPDATE SET

              title =
                excluded.title,

              vehicle =
                excluded.vehicle,

              years =
                excluded.years,

              frequency =
                excluded.frequency,

              chip_id =
                excluded.chip_id,

              button_configuration =
                excluded.button_configuration,

              fcc_id =
                excluded.fcc_id,

              oem_part =
                excluded.oem_part,

              buttons =
                excluded.buttons,

              remote_start =
                excluded.remote_start,

              notes =
                excluded.notes,

              updated_at =
                CURRENT_TIMESTAMP
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

              data.remoteStart
                ? 1
                : 0,

              data.notes || ""
            )
            .run();


          product =
            await env.DB.prepare(`
              SELECT *
              FROM products
              WHERE slug = ?
            `)
              .bind(slug)
              .first();


          if (!product) {
            throw new Error(
              "Product could not be found after saving."
            );
          }
        }



        // -------------------------------------------------
        // CHECK IF THIS EXACT SUPPLIER LISTING EXISTS
        // -------------------------------------------------

        const existingListing =
          await env.DB.prepare(`
            SELECT id

            FROM supplier_listings

            WHERE
              product_id = ?
              AND supplier_name = ?
              AND url = ?

            LIMIT 1
          `)
            .bind(
              product.id,
              data.supplierName || "",
              data.url
            )
            .first();



        if (existingListing) {

          await env.DB.prepare(`
            UPDATE supplier_listings

            SET
              supplier_product_id = ?,
              condition_type = ?,
              price = ?,
              stock_status = ?,
              shipping = ?,
              affiliate_url = ?,
              last_checked = ?,
              updated_at =
                CURRENT_TIMESTAMP

            WHERE id = ?
          `)
            .bind(
              data.supplierProductId || "",
              data.conditionType || "",

              data.price ?? null,

              data.stockStatus || "",
              data.shipping || "",
              data.affiliateUrl || "",

              currentDate(),

              existingListing.id
            )
            .run();

        } else {

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

            VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              CURRENT_TIMESTAMP
            )
          `)
            .bind(
              product.id,

              data.supplierName || "",
              data.supplierProductId || "",
              data.conditionType || "",

              data.price ?? null,

              data.stockStatus || "",
              data.shipping || "",

              data.url,
              data.affiliateUrl || "",

              currentDate()
            )
            .run();
        }


        return json({
          success: true,

          message:
            existingListing
              ? "Supplier listing updated."
              : existingProductId
                ? "Supplier added to existing KeyCache product."
                : "New product saved to KeyCache.",

          productId:
            product.id
        });

      } catch (error) {
        return json(
          {
            error:
              "Unable to save product.",

            details:
              error.message
          },
          500
        );
      }
    }



    // =====================================================
    // HEALTH CHECK
    // =====================================================

    if (
      url.pathname === "/api/health"
    ) {
      return json({
        success: true,

        version:
          "KEYCACHE_LIVE_SEARCH_V1",

        message:
          "KeyCache API is alive."
      });
    }



    // =====================================================
    // D1 PUBLIC SEARCH
    // =====================================================

    if (
      url.pathname === "/api/search" &&
      request.method === "GET"
    ) {
      try {
        const query =
          (
            url.searchParams.get("q") ||
            ""
          ).trim();


        if (!query) {
          return json({
            products: []
          });
        }


        const search =
          `%${query}%`;


        const results =
          await env.DB.prepare(`
            SELECT

              p.id,
              p.slug,
              p.title,
              p.vehicle,
              p.years,

              p.frequency,
              p.chip_id,
              p.button_configuration,

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

            WHERE

              p.title LIKE ?

              OR p.vehicle LIKE ?

              OR p.years LIKE ?

              OR p.frequency LIKE ?

              OR p.chip_id LIKE ?

              OR p.button_configuration LIKE ?

              OR p.fcc_id LIKE ?

              OR p.oem_part LIKE ?

              OR p.notes LIKE ?

            ORDER BY

              p.id DESC,

              CASE
                WHEN s.price IS NULL
                THEN 1
                ELSE 0
              END,

              s.price ASC
          `)
            .bind(
              search,
              search,
              search,
              search,
              search,
              search,
              search,
              search,
              search
            )
            .all();


        const products = {};


        for (
          const row
          of results.results
        ) {

          if (
            !products[row.id]
          ) {
            products[row.id] = {

              id:
                row.id,

              slug:
                row.slug,

              title:
                row.title,

              vehicle:
                row.vehicle,

              years:
                row.years,

              frequency:
                row.frequency,

              chipId:
                row.chip_id,

              buttonConfiguration:
                row.button_configuration,

              fccId:
                row.fcc_id,

              oemPart:
                row.oem_part,

              buttons:
                row.buttons,

              remoteStart:
                Boolean(
                  row.remote_start
                ),

              notes:
                row.notes,

              suppliers: []
            };
          }


          if (
            row.supplier_name
          ) {
            products[
              row.id
            ].suppliers.push({

              listingId:
                row.listing_id,

              name:
                row.supplier_name,

              supplierProductId:
                row.supplier_product_id,

              type:
                row.condition_type,

              price:
                row.price,

              stock:
                row.stock_status,

              shipping:
                row.shipping,

              url:
                row.affiliate_url ||
                row.url,

              sourceUrl:
                row.url,

              lastChecked:
                row.last_checked
            });
          }
        }


        return json({
          products:
            Object.values(
              products
            )
        });

      } catch (error) {
        return json(
          {
            error:
              "Search failed.",

            details:
              error.message
          },
          500
        );
      }
    }



    // =====================================================
    // ADMIN PRODUCT LIST
    // =====================================================

    if (
      url.pathname ===
        "/api/admin/products" &&
      request.method === "GET"
    ) {
      try {
        const results =
          await env.DB.prepare(`
            SELECT

              p.id,
              p.slug,
              p.title,
              p.vehicle,
              p.years,

              p.frequency,
              p.chip_id,
              p.button_configuration,

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

            ORDER BY
              p.title ASC,
              s.supplier_name ASC
          `)
            .all();


        return json({
          success: true,

          products:
            results.results
        });

      } catch (error) {
        return json(
          {
            error:
              "Unable to load products.",

            details:
              error.message
          },
          500
        );
      }
    }



    // =====================================================
    // UPDATE PRODUCT + LISTING
    // =====================================================

    if (
      url.pathname ===
        "/api/admin/products" &&
      request.method === "PUT"
    ) {
      try {
        const data =
          await request.json();


        if (
          !data.productId ||
          !data.listingId
        ) {
          return json(
            {
              error:
                "Product ID and listing ID are required."
            },
            400
          );
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

            updated_at =
              CURRENT_TIMESTAMP

          WHERE id = ?
        `)
          .bind(
            data.title || "",
            data.vehicle || "",
            data.years || "",

            data.frequency || "",
            data.chipId || "",
            data.buttonConfiguration || "",

            data.fccId || "",
            data.oemPart || "",
            data.buttons || "",

            data.remoteStart
              ? 1
              : 0,

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

            updated_at =
              CURRENT_TIMESTAMP

          WHERE id = ?
        `)
          .bind(
            data.supplierName || "",
            data.supplierProductId || "",
            data.conditionType || "",

            data.price ?? null,

            data.stockStatus || "",
            data.shipping || "",
            data.url || "",
            data.affiliateUrl || "",

            currentDate(),

            data.listingId
          )
          .run();


        return json({
          success: true,
          message:
            "Product updated."
        });

      } catch (error) {
        return json(
          {
            error:
              "Unable to update product.",

            details:
              error.message
          },
          500
        );
      }
    }



    // =====================================================
    // DELETE PRODUCT
    // =====================================================

    if (
      url.pathname ===
        "/api/admin/products" &&
      request.method === "DELETE"
    ) {
      try {
        const data =
          await request.json();


        const productId =
          Number(
            data.productId
          );


        if (!productId) {
          return json(
            {
              error:
                "Product ID is required."
            },
            400
          );
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
          message:
            "Product deleted."
        });

      } catch (error) {
        return json(
          {
            error:
              "Unable to delete product.",

            details:
              error.message
          },
          500
        );
      }
    }



    // =====================================================
    // STATIC WEBSITE FILES
    // =====================================================

    return env.ASSETS.fetch(
      request
    );
  }
};



// =========================================================
// LIVE SUPPLIER SEARCH
// =========================================================

async function searchSupplier(
  supplier,
  query
) {
  const started =
    Date.now();


  try {

    // =====================================
    // SHOPIFY PREDICTIVE SEARCH JSON
    // =====================================

    const searchUrl =
      supplier.baseUrl +
      "/search/suggest.json?q=" +
      encodeURIComponent(query) +
      "&resources[type]=product" +
      "&resources[limit]=10";


    const response =
      await fetchWithTimeout(
        searchUrl,
        5000
      );


    if (!response.ok) {
      return {
        supplier:
          supplier.name,

        ok: false,

        searchStatus:
          response.status,

        searchMs:
          Date.now() - started,

        error:
          "Supplier search returned HTTP " +
          response.status,

        products: []
      };
    }


    const data =
      await response.json();


    const rawProducts =
      data?.resources
        ?.results
        ?.products || [];


    // =====================================
    // NORMALIZE SUPPLIER RESULTS
    // =====================================

    const products =
      rawProducts
        .map(product => {

          const title =
            cleanText(
              product.title || ""
            );


          let productUrl =
            product.url || "";


          if (
            productUrl.startsWith("/")
          ) {
            productUrl =
              supplier.baseUrl +
              productUrl;
          }


          // Shopify URLs sometimes contain
          // predictive-search tracking params.
          // We only need the real product path.

          try {
            const parsed =
              new URL(
                productUrl,
                supplier.baseUrl
              );

            parsed.search = "";

            productUrl =
              parsed.toString();

          } catch {
            // Keep original URL if parsing fails.
          }


          const rawPrice =
            product.price;


          let price =
            null;


          if (
            rawPrice !== undefined &&
            rawPrice !== null &&
            rawPrice !== ""
          ) {

            const cleanedPrice =
              String(rawPrice)
                .replace(
                  /[^0-9.]/g,
                  ""
                );


            if (
              cleanedPrice &&
              !Number.isNaN(
                Number(cleanedPrice)
              )
            ) {
              price =
                Number(
                  cleanedPrice
                );
            }
          }


          const matchScore =
            scoreCandidate(
              title,
              productUrl,
              query
            );


          return {
            supplier:
              supplier.name,

            title,

            price,

            sku:
              "",

            stock:
              product.available === true
                ? "In stock"
                : product.available === false
                  ? "Out of stock"
                  : "Check supplier",

            type:
              classifySearchProduct(
                product,
                title
              ),

            url:
              productUrl,

            matchScore,

            searchStage:
              "predictive-json"
          };
        })


        // Remove anything with no useful title.
        .filter(
          product =>
            product.title
        )


        // Strongest match first.
        .sort(
          (a, b) => {

            if (
              b.matchScore !==
              a.matchScore
            ) {
              return (
                b.matchScore -
                a.matchScore
              );
            }


            const priceA =
              typeof a.price ===
                "number"
                ? a.price
                : Infinity;


            const priceB =
              typeof b.price ===
                "number"
                ? b.price
                : Infinity;


            return (
              priceA -
              priceB
            );
          }
        )


        // Keep the best five from
        // this supplier.
        .slice(0, 5);


    return {
      supplier:
        supplier.name,

      ok: true,

      searchStatus:
        response.status,

      searchMs:
        Date.now() -
        started,

      products
    };


  } catch (error) {

    return {
      supplier:
        supplier.name,

      ok: false,

      searchMs:
        Date.now() -
        started,

      error:
        error.message,

      products: []
    };
  }
}



// =========================================================
// FIND BEST SEARCH RESULT
// =========================================================

function findProductCandidates(
  html,
  baseUrl,
  query,
  limit = 5
) {
  const productLinkRegex =
    /<a[^>]+href=["']([^"']*\/products\/[^"'?#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

  const candidates = [];
  const seenUrls = new Set();

  let match;

  while (
    (match = productLinkRegex.exec(html)) !== null
  ) {
    let productUrl = match[1];

    if (productUrl.startsWith("//")) {
      productUrl =
        "https:" + productUrl;

    } else if (productUrl.startsWith("/")) {
      productUrl =
        baseUrl + productUrl;

    } else if (
      !productUrl.startsWith("http")
    ) {
      productUrl =
        baseUrl + "/" + productUrl;
    }

    productUrl =
      productUrl.split("?")[0];

    if (seenUrls.has(productUrl)) {
      continue;
    }

    let title =
      stripHtml(match[2]);

    title =
      cleanSearchTitle(title);

    if (!title) {
      continue;
    }

    seenUrls.add(productUrl);

    const score =
      scoreCandidate(
        title,
        productUrl,
        query
      );

    candidates.push({
      title,
      url: productUrl,
      score
    });
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score
  );

  return candidates.slice(
    0,
    limit
  );
}



// =========================================================
// BASIC NON-AI SEARCH RANKING
// =========================================================

function scoreCandidate(
  title,
  productUrl,
  query
) {
  const titleLower =
    String(title || "")
      .toLowerCase();

  const urlLower =
    String(productUrl || "")
      .toLowerCase();

  const queryLower =
    String(query || "")
      .toLowerCase()
      .trim();

  let score = 0;


  // =====================================
  // BASIC MATCHING
  // =====================================

  if (titleLower === queryLower) {
    score += 500;
  }

  if (titleLower.includes(queryLower)) {
    score += 250;
  }

  if (urlLower.includes(queryLower)) {
    score += 100;
  }

  const words =
    queryLower
      .split(/\s+/)
      .filter(Boolean);

  for (const word of words) {
    if (titleLower.includes(word)) {
      score += 40;
    }

    if (urlLower.includes(word)) {
      score += 15;
    }
  }


  // =====================================
  // PRODUCT INTENT
  // =====================================

  const wantsSmartKey =
    queryLower.includes("smart key") ||
    queryLower.includes("smartkey");

  const wantsEmergencyKey =
    queryLower.includes("emergency key") ||
    queryLower.includes("insert key");

  const wantsTool =
    queryLower.includes("tool") ||
    queryLower.includes("emulator") ||
    queryLower.includes("programmer");


  // If user asked for a smart key,
  // strongly favor actual smart-key listings.

  if (wantsSmartKey) {
    if (
      titleLower.includes("smart key") ||
      titleLower.includes("smartkey")
    ) {
      score += 250;
    }

    if (
      titleLower.includes("remote") ||
      titleLower.includes("fob")
    ) {
      score += 80;
    }

  if (
  titleLower.includes("emergency key") ||
  titleLower.includes("insert key") ||
  urlLower.includes("emergency-key") ||
  urlLower.includes("insert-key")
) {
  score -= 500;
}

    if (
  titleLower.includes("emulator") ||
  titleLower.includes("programmer") ||
  titleLower.includes("tool") ||
  urlLower.includes("emulator") ||
  urlLower.includes("programmer") ||
  urlLower.includes("tool")
) {
  score -= 600;
}

  }
  // If user specifically asked for an emergency key,
  // reverse the preference.

  if (wantsEmergencyKey) {
    if (
      titleLower.includes("emergency key") ||
      titleLower.includes("insert key")
    ) {
      score += 300;
    }
  }


  // If user specifically asked for a tool,
  // don't penalize tools.

  if (wantsTool) {
    if (
      titleLower.includes("emulator") ||
      titleLower.includes("programmer") ||
      titleLower.includes("tool")
    ) {
      score += 300;
    }
  }


  // =====================================
  // H92 FAMILY BOOSTS
  // =====================================

  if (
    queryLower.includes("h92") &&
    titleLower.includes("h92-pt")
  ) {
    score += 120;
  }

  if (
    queryLower.includes("h92") &&
    (
      titleLower.includes("5913441") ||
      urlLower.includes("5913441")
    )
  ) {
    score += 150;
  }

  if (
    queryLower.includes("h92") &&
    (
      titleLower.includes("164-r8040") ||
      urlLower.includes("164-r8040")
    )
  ) {
    score += 150;
  }

  if (
    queryLower.includes("h92") &&
    titleLower.includes("strattec")
  ) {
    score += 75;
  }


  // =====================================
  // BULK / BUNDLE PENALTIES
  // =====================================

  const userAskedForBulk =
    /\b(pack|bundle|bulk|x\d+|\d+\s*pack)\b/i
      .test(queryLower);

  const bulkPattern =
    /(?:pack|bundle)[\s_-]*(?:of[\s_-]*)?\d+|\d+[\s_-]*(?:pack|bundle)|x\d+|pk\d+/i;

  if (
    !userAskedForBulk &&
    (
      bulkPattern.test(titleLower) ||
      bulkPattern.test(urlLower)
    )
  ) {
    score -= 600;
  }


  return score;
}



// =========================================================
// PRODUCT DETAIL EXTRACTION
// =========================================================

function extractProductDetails(
  html,
  productUrl
) {
  const title =
    getMeta(
      html,
      "property",
      "og:title"
    ) ||
    getMeta(
      html,
      "name",
      "twitter:title"
    ) ||
    getTitle(html) ||
    "";


  let price =
    getMeta(
      html,
      "property",
      "product:price:amount"
    ) ||
    extractJsonLdValue(
      html,
      "price"
    ) ||
    "";


  if (
    typeof price ===
      "string"
  ) {
    price =
      price
        .replace(
          /[^0-9.]/g,
          ""
        )
        .trim();
  }


  const numericPrice =
    price &&
    !Number.isNaN(
      Number(price)
    )
      ? Number(price)
      : null;


  const sku =
    extractJsonLdValue(
      html,
      "sku"
    ) ||
    extractJsonLdValue(
      html,
      "mpn"
    ) ||
    "";


  let stock =
    extractJsonLdValue(
      html,
      "availability"
    ) ||
    "";


  if (
    stock.includes(
      "InStock"
    )
  ) {
    stock =
      "In stock";

  } else if (
    stock.includes(
      "OutOfStock"
    )
  ) {
    stock =
      "Out of stock";
  }


  if (!stock) {

    const lower =
      html.toLowerCase();


    if (
      lower.includes(
        "in stock"
      )
    ) {
      stock =
        "In stock";

    } else if (
      lower.includes(
        "out of stock"
      )
    ) {
      stock =
        "Out of stock";

    } else {
      stock =
        "Check supplier";
    }
  }


  const condition =
    extractJsonLdValue(
      html,
      "itemCondition"
    ) ||
    "";


  const cleanedTitle =
    cleanText(
      title
    );


  const type =
    condition
      ? cleanCondition(
          condition
        )
      : guessProductType(
          cleanedTitle
        );


  return {
    title:
      cleanedTitle,

    price:
      numericPrice,

    sku:
      cleanText(
        sku
      ),

    stock,

    type,

    url:
      productUrl
  };
}



// =========================================================
// FETCH WITH TIMEOUT
// =========================================================

async function fetchWithTimeout(
  url,
  timeoutMs = 10000
) {
  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );


  try {
    return await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 KeyCache Prototype"
        },

        redirect:
          "follow",

        signal:
          controller.signal
      }
    );

  } finally {
    clearTimeout(
      timer
    );
  }
}



// =========================================================
// GENERAL HELPERS
// =========================================================

function detectSearchMode(query) {
  const text =
    String(query || "")
      .trim()
      .toLowerCase();

  // Short locksmith identifiers:
  // H92, B111, HYQ4EA, 5913441, etc.
  const looksLikeIdentifier =
    /^[a-z0-9-]{3,20}$/i.test(text) &&
    !text.includes(" ");

  // Multi-word searches are treated as
  // discovery searches for now.
  if (!looksLikeIdentifier) {
    return "discovery";
  }

  return "comparison";
}

function json(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(
      data,
      null,
      2
    ),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store"
      }
    }
  );
}


function currentDate() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}


function createSlug(text) {
  return (
    String(text)
      .toLowerCase()
      .trim()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      ) ||
    "product-" +
      Date.now()
  );
}


function supplierFromHostname(
  hostname
) {
  const host =
    hostname
      .replace(
        /^www\./,
        ""
      )
      .toLowerCase();


  const suppliers = {

    "americankeysupply.com":
      "American Key Supply",

    "uhs-hardware.com":
      "UHS Hardware",

    "clksupplies.com":
      "CLK Supplies",

    "locksmithkeyless.com":
      "Locksmith Keyless",

    "transponderisland.com":
      "Transponder Island",

    "keyinnovations.com":
      "Key Innovations",

    "royalkeysupply.com":
      "Royal Key Supply",

    "securitysupplydirect.com":
      "Security Supply Direct",

    "executivekeysupply.com":
      "Executive Key Supply"
  };


  return (
    suppliers[host] ||
    host
  );
}


function stripHtml(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " "
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " "
    )
    .replace(
      /<[^>]*>/g,
      " "
    )
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&#39;/g,
      "'"
    )
    .replace(
      /&nbsp;/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function cleanSearchTitle(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /^"+\s*class="[^"]*"\s*>?/gi,
      ""
    )
    .replace(
      /"+\s*class="[^"]*"\s*>?/gi,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function guessProductType(
  title
) {
  const text =
    String(title || "")
      .toLowerCase();


  if (
    text.includes("emergency key") ||
    text.includes("insert key")
  ) {
    return "Emergency Key";
  }


  if (
    text.includes("emulator") ||
    text.includes("programmer") ||
    text.includes("tool")
  ) {
    return "Tool / Programmer";
  }


  if (
    text.includes("aftermarket")
  ) {
    return "Aftermarket";
  }


  if (
    text.includes("refurb")
  ) {
    return "Refurbished OEM";
  }


  if (
    text.includes("oem") ||
    text.includes("strattec")
  ) {
    return "OEM";
  }


  if (
    text.includes("smart key") ||
    text.includes("smartkey") ||
    text.includes("remote") ||
    text.includes("fob")
  ) {
    return "Smart Key / Remote";
  }


  return "Unknown";
}

function classifySearchProduct(
  product,
  title
) {
  const combined =
    [
      title,
      product.type,
      product.vendor,
      ...(Array.isArray(product.tags)
        ? product.tags
        : [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();


  if (
    combined.includes(
      "emergency key"
    ) ||
    combined.includes(
      "insert key"
    )
  ) {
    return "Emergency Key";
  }


  if (
    combined.includes(
      "emulator"
    ) ||
    combined.includes(
      "programmer"
    ) ||
    combined.includes(
      "tool"
    )
  ) {
    return "Tool / Programmer";
  }


  if (
    combined.includes(
      "refurb"
    )
  ) {
    return "Refurbished OEM";
  }


  if (
    combined.includes(
      "aftermarket"
    )
  ) {
    return "Aftermarket";
  }


  if (
    combined.includes(
      "oem"
    ) ||
    combined.includes(
      "strattec"
    )
  ) {
    return "OEM";
  }


  if (
    combined.includes(
      "smart key"
    ) ||
    combined.includes(
      "smartkey"
    ) ||
    combined.includes(
      "remote"
    ) ||
    combined.includes(
      "fob"
    )
  ) {
    return "Smart Key / Remote";
  }


  return (
    product.type ||
    "Unknown"
  );
}

function getMeta(
  html,
  attribute,
  value
) {
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


  for (
    const pattern
    of patterns
  ) {
    const match =
      html.match(
        pattern
      );


    if (match) {
      return match[1];
    }
  }


  return "";
}


function getTitle(
  html
) {
  const match =
    html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );


  return match
    ? match[1]
    : "";
}


function extractJsonLdValue(
  html,
  key
) {
  const scripts = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  ];


  for (
    const script
    of scripts
  ) {
    try {
      const parsed =
        JSON.parse(
          script[1].trim()
        );


      const result =
        findKey(
          parsed,
          key
        );


      if (
        result !== undefined &&
        result !== null
      ) {
        return String(
          result
        );
      }

    } catch {
      // Ignore malformed JSON-LD
    }
  }


  return "";
}


function findKey(
  value,
  targetKey
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return undefined;
  }


  if (
    Object.prototype
      .hasOwnProperty.call(
        value,
        targetKey
      )
  ) {
    return value[
      targetKey
    ];
  }


  for (
    const child
    of Object.values(
      value
    )
  ) {
    if (
      typeof child ===
      "object"
    ) {
      const result =
        findKey(
          child,
          targetKey
        );


      if (
        result !== undefined
      ) {
        return result;
      }
    }
  }


  return undefined;
}


function cleanCondition(
  value
) {
  if (!value) {
    return "";
  }


  return String(value)
    .replace(
      "https://schema.org/",
      ""
    )
    .replace(
      "http://schema.org/",
      ""
    )
    .replace(
      /([a-z])([A-Z])/g,
      "$1 $2"
    );
}


function cleanText(
  value
) {
  if (!value) {
    return "";
  }


  return String(value)
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&#39;/g,
      "'"
    )
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function escapeRegex(
  value
) {
  return String(value)
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
}
