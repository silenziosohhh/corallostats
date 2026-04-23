const mongoose = require("mongoose");

let connecting = null;

async function connectToMongo(mongoUri) {
  if (!mongoUri) throw new Error("Missing MONGO_URI");
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;

  connecting = mongoose
    .connect(mongoUri, {
      serverSelectionTimeoutMS: 12_000,
    })
    .then(() => mongoose)
    .finally(() => {
      connecting = null;
    });

  return connecting;
}

module.exports = { connectToMongo };

