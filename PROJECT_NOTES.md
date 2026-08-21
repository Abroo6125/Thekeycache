# KeyCache Project Notes

## Project Vision

KeyCache is being developed as a locksmith-focused product comparison and sourcing search engine.

The long-term goal is for a locksmith or buyer to enter the product they need into KeyCache and receive comparable purchasing options from multiple locksmith suppliers.

Instead of manually building and maintaining a massive copy of every supplier's catalog, KeyCache is moving toward a live supplier-search architecture.

---

# Core Product Concept

A user searches KeyCache for something like:

H92

KeyCache searches participating/approved supplier sources, retrieves matching products, normalizes the results, and displays them together.

Example:

User Search
↓
KeyCache
↓
Royal Key Supply + CLK Supplies + future suppliers
↓
Supplier search results
↓
Product detail extraction
↓
Normalized KeyCache comparison
↓
Buyer chooses supplier

KeyCache should ultimately compare information such as:

- Supplier
- Product title
- OEM vs aftermarket
- Price
- Stock
- SKU
- OEM part number
- FCC ID
- Chip
- Quantity / pack size
- Product URL
- Shipping information when available

---

# Development Philosophy

Build the primitive search engine first.

Do NOT add AI until the underlying supplier search engine works reliably.

The development sequence is:

1. Exact/basic search
2. Live supplier retrieval
3. Product extraction
4. Product normalization
5. Comparison UI
6. More suppliers
7. OpenAI natural-language interpretation
8. Supplier-authorized integrations
9. Connected buyer accounts / dealer pricing

AI should enhance the search engine, not replace factual supplier data.

Supplier websites and approved feeds remain the source of truth for price, inventory, product details, etc.

---

# Primitive Search Engine

The first prototype uses ordinary programming rather than AI.

Example:

H92
↓
KeyCache Worker
↓
Search Royal
Search CLK
↓
Find likely matching product URLs
↓
Open product pages
↓
Extract product information
↓
Normalize results
↓
Return comparison

Basic scoring/ranking logic is used to decide which supplier search result most closely matches the user's query.

---

# Current Technology

## Front End

KeyCache website

## Hosting / Backend

Cloudflare Workers

Worker preview:

thekeycache.aaronbrooks67.workers.dev

The primary domain is intentionally inactive while the prototype is being developed.

## Database

Cloudflare D1

Database binding:

env.DB

Database:

keycache-db

## Static Assets

Cloudflare Assets binding:

env.ASSETS

## Repository

GitHub repository:

Abroo6125/Thekeycache

Main Worker entry point:

worker.js

Wrangler configuration points to:

worker.js

---

# Existing Database Architecture

KeyCache currently has:

products

and

supplier_listings

Products represent KeyCache master products.

Supplier listings represent individual supplier offers associated with a master product.

The database remains useful even with live supplier search for:

- caching
- normalization mappings
- product identifiers
- supplier configuration
- popular searches
- analytics
- click tracking
- saved products
- account integrations
- fallback data

The database is no longer intended to require manually copying every supplier product into KeyCache.

---

# Product Administration

KeyCache already supports:

- adding products
- importing product information
- editing products
- deleting products
- attaching multiple supplier listings to one master product
- searching existing D1 products

Manual product administration remains useful for testing and exceptions.

---

# Live Supplier Search Prototype

Current endpoint:

/api/live-search?q=H92

Current prototype version:

KEYCACHE_LIVE_SEARCH_V1

The endpoint currently searches:

1. Royal Key Supply
2. CLK Supplies

It then:

1. retrieves each supplier's search page
2. identifies candidate product links
3. ranks candidates
4. opens the best candidate
5. extracts product details
6. returns normalized results

Nothing from this endpoint is currently saved to D1.

---

# Royal Key Supply Test Results

Royal has successfully passed the complete technical prototype chain.

Confirmed:

Cloudflare Worker
→ Royal search
→ search HTML retrieval
→ H92 detection
→ product URL extraction
→ product-page retrieval
→ product-detail extraction

Successful H92 result:

Supplier:
Royal Key Supply

Product:
Ford Aftermarket 2000-2020 Transponder Key H92-PT

Price:
$3.85

SKU:
FOR-38-AM

Stock:
In stock

Type:
Aftermarket

This was retrieved automatically without manually entering the supplier listing into KeyCache.

---

# CLK Supplies Test Results

Cloudflare can successfully:

- reach CLK
- retrieve CLK search results
- discover H92 products
- open CLK product pages
- extract product details

Current issue:

For the search:

H92

CLK currently selects:

H92-PT-PK10

which is a pack of 10 priced at $62.99.

That is technically a valid H92 search result but is not the desired default comparison against a single Royal key.

The next task is improving result ranking so a generic H92 search prefers single-unit products over bulk packs.

Bulk results should still be returned when the buyer specifically searches for bulk quantities.

---

# Search Ranking Direction

Primitive search ranking should consider:

Positive signals:

- exact query in title
- exact query in URL
- exact SKU
- OEM part number
- FCC ID
- known cross-reference
- chip ID
- exact key identifier

Negative signals when NOT requested:

- pack of 10
- 10-pack
- PK10
- x10
- bundles
- bulk quantities

If the user specifically requests:

H92 pack of 10

then bulk products should NOT receive a ranking penalty.

Eventually this logic may be replaced or enhanced by structured AI interpretation.

---

# Future AI Architecture

OpenAI may later be used to interpret natural human searches.

Example:

"need the ford 80 bit transponder key"

could become structured search information such as:

Product family:
H92

OEM:
5913441

Cross reference:
164-R8040

Chip:
4D63 80 Bit

KeyCache would then use those identifiers to search supplier sources.

Important rule:

AI interprets buyer intent.

AI does NOT invent authoritative price, inventory, compatibility, or supplier data.

---

# Supplier Permission Strategy

Public accessibility does not automatically mean commercial automated retrieval is permitted.

Before public launch, suppliers should be classified based on access and permission.

Possible supplier integration methods:

- authorized public retrieval
- official API
- CSV feed
- XML feed
- product feed
- Shopify feed/integration
- supplier partnership
- authenticated dealer API
- buyer-connected supplier account

The private Cloudflare prototype is currently being used to establish technical feasibility.

---

# Supplier Findings So Far

## Royal Key Supply

Technically excellent candidate.

Public catalog exposes useful product information.

Permission / authorized commercial integration should be discussed before public launch.

## CLK Supplies

Technically accessible and successfully searchable from Cloudflare.

Permission / approved integration should still be verified before public launch.

## UHS Hardware

Technically accessible, but authorization should be obtained before automated commercial use.

## Locksmith Keyless

Terms have been identified as restricting scraping/crawling.

Do not build unauthorized automated retrieval around this supplier.

Potential future partnership/API candidate.

## Transponder Island

Pricing can require login.

Potential future KeyCache Pro / connected-account candidate.

---

# Potential Business Model

Do not depend on suppliers paying KeyCache merely for basic traffic.

Possible revenue models include:

## KeyCache Pro for Buyers

Potential features:

- connected supplier accounts
- personalized dealer pricing
- saved supplier preferences
- stock alerts
- purchasing history
- team accounts
- advanced sourcing tools

## Supplier Tools

Potential paid features:

- official catalog integration
- enhanced inventory synchronization
- supplier analytics
- demand analytics
- conversion attribution
- richer product data
- supplier dashboard
- clearly labeled sponsored placement

Organic ranking should remain trustworthy and should not secretly favor paying suppliers.

## Referral / Transaction Revenue

If supplier partnerships eventually allow it, KeyCache could receive referral or performance-based compensation for attributable purchases.

---

# Free vs Pro Concept

## KeyCache Free

Searches suppliers that permit KeyCache to retrieve appropriate public catalog information.

Shows public product comparisons.

## KeyCache Pro

Could allow locksmiths to connect supplier accounts.

Potentially shows:

- dealer-specific pricing
- account-specific discounts
- gated inventory
- supplier-specific purchasing information

Where possible, official APIs, tokens, OAuth, or supplier-approved authentication should be used instead of storing raw supplier passwords.

---

# Supplier Partnership Pitch

KeyCache should NOT approach suppliers by simply asking:

"Can we scrape your website?"

The preferred conversation is:

KeyCache is a locksmith product-comparison platform that sends high-intent buyers directly to suppliers.

Ask whether the supplier offers:

- API access
- product feeds
- CSV/XML feeds
- Shopify integrations
- catalog integrations
- approved automated retrieval
- partnership access

Early supplier inclusion may remain free while KeyCache proves buyer demand.

---

# Long-Term KeyCache Flow

Buyer
↓
Natural-language or exact search
↓
KeyCache query interpretation
↓
Supplier connectors
↓
Authorized supplier data
↓
Normalization
↓
Product comparison
↓
Buyer chooses supplier
↓
Supplier receives high-intent purchase traffic

---

# Current Immediate Task

Improve CLK result ranking.

For:

H92

Desired behavior:

Royal:
single H92 product

CLK:
single H92 product

NOT:

CLK H92 pack of 10

After ranking works:

1. connect /api/live-search to the KeyCache front end
2. display live Royal + CLK results using existing comparison UI
3. test additional exact product searches
4. test third supplier
5. improve normalization
6. only then begin AI query interpretation experiments

---

# Important Development Preference

For small code changes:

Provide the exact small section that needs to be changed.

For large changes involving many edits:

Provide the entire replacement file so it can be copied and pasted safely.

Avoid unnecessary partial edits when a full replacement would be clearer.

---

# Current Milestone

KeyCache has proven that a Cloudflare Worker can automatically:

search a real locksmith supplier
→ identify a requested product
→ open the supplier product page
→ extract live price, stock, SKU, and product information
→ normalize the result

Royal and CLK both technically work.

The next challenge is result quality and ranking, not basic supplier connectivity.

This is the first working proof of the KeyCache live supplier-search architecture.
