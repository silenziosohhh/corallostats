function createCorsMiddleware({ allowOrigin = "*" } = {}) {
  return function cors(req, res, next) {
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "600");

    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  };
}

module.exports = { createCorsMiddleware };

