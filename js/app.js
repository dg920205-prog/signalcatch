import { bindTabs, renderSummary, setApiStatus } from "./ui/dashboard.js";
import { dom } from "./ui/dom.js";

function bindDialog() {
  const dialog = document.querySelector("#settings-dialog");
  document.querySelector("#settings-open").addEventListener("click", () => dialog.showModal());
  document.querySelector("#settings-close").addEventListener("click", () => dialog.close());
}

function bindBacktestPresets() {
  const input = document.querySelector("#backtest-days");
  for (const button of document.querySelectorAll("[data-preset-days]")) {
    button.addEventListener("click", () => {
      input.value = button.getAttribute("data-preset-days");
    });
  }
}

bindTabs();
bindDialog();
bindBacktestPresets();
renderSummary(document.querySelector("#summary-grid"), {}, { dom });
setApiStatus(document.querySelector("#api-status"), "idle", { dom });
