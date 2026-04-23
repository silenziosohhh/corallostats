const { exec } = require("child_process");

function createScraperScheduler({ scriptCommand, onLog }) {
  let running = false;
  let lastRun = null;
  let lastError = null;

  function runOnce() {
    if (running) return;
    running = true;
    lastRun = new Date();
    lastError = null;

    onLog?.(`[${lastRun.toLocaleString()}] Avvio aggiornamento dati...`);

    const child = exec(scriptCommand, { windowsHide: true }, (error, stdout, stderr) => {
      running = false;
      if (stdout) onLog?.(stdout.trimEnd());
      if (stderr) onLog?.(stderr.trimEnd());
      if (error) {
        lastError = error.message;
        onLog?.(`Errore scraper: ${error.message}`);
        return;
      }
      onLog?.("Dati aggiornati con successo.");
    });

    child.on("error", (err) => {
      running = false;
      lastError = err.message;
      onLog?.(`Errore scraper: ${err.message}`);
    });
  }

  function getStatus() {
    return {
      running,
      lastRun: lastRun ? lastRun.toISOString() : null,
      lastError,
    };
  }

  return { runOnce, getStatus };
}

module.exports = { createScraperScheduler };

