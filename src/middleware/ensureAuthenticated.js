function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated?.() === true) return next();
  res.status(401).json({ error: "Effettua il login per vedere i dati" });
}

module.exports = { ensureAuthenticated };

