export async function prepareShell() {
  if (!("serviceWorker" in navigator))
    throw new Error("Este navegador não permite preparar a aplicação offline");
  // Development HMR is not a stable shell; use the built HTTPS environment for offline.
  if (import.meta.env.DEV)
    throw new Error(
      "Preparação offline disponível no ambiente compilado: https://localhost:5443/checkpoint",
    );
  await navigator.serviceWorker.register("/sw.js", {
    scope: "/checkpoint",
    updateViaCache: "none",
  });
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Não foi possível preparar o cache offline")), 15000),
    ),
  ]);
  if (!navigator.serviceWorker.controller)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Reabra o checkpoint online para concluir a preparação")),
        5000,
      );
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  if (navigator.storage?.persist) await navigator.storage.persist();
}
