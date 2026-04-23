import { initUserChip } from "../shell/userChip.js";

initUserChip({
  accountSelector: "#nav-account",
  loginSelector: "#nav-login",
}).catch(() => {
  // keep page usable
});

