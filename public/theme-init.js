(function () {
  try {
    var theme = localStorage.getItem("vs-theme");
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    if (localStorage.getItem("vs-sparkle") === "on") {
      document.documentElement.setAttribute("data-sparkle", "on");
    }
  } catch {
    console.warn("[theme-init] localStorage indisponivel; mantendo o tema do sistema.");
  }
})();
