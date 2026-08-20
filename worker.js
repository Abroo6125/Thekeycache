export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API routes will go here next
    if (url.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ message: "KeyCache API is alive" }),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Everything else serves the normal website
    return env.ASSETS.fetch(request);
  }
};
