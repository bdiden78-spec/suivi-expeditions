/* Installation Windows / Android et mises à jour choisies par l'utilisateur. */
(function () {
  'use strict';
  let installEvent = null;
  const appBase = new URL('../', document.currentScript?.src || new URL('js/pwa.js', location.href).href);
  let workerError = '';
  let helpMessage = null;
  let registration = null;
  let installButton = null;
  let updateButton = null;
  let applyingUpdate = false;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installEvent = event;
    refreshHelp();
    if (installButton && !standalone()) installButton.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    if (installButton) installButton.hidden = true;
    document.getElementById('pwaInstallHelp')?.close();
  });
  function refreshHelp() {
    if (!helpMessage) return;
    helpMessage.textContent = standalone() ? 'LogiTrak est déjà ouvert comme application installée.' : location.protocol === 'file:' ? 'Installation indisponible depuis un fichier local. Ouvrez la version publiée en HTTPS, puis cliquez sur Installer.' : !window.isSecureContext ? 'Cette adresse ne permet pas une installation sécurisée. Ouvrez LogiTrak en HTTPS.' : workerError ? 'Le module d’installation ne se charge pas. Vérifiez que sw.js, offline.html, manifest.webmanifest et le dossier assets sont publiés au même emplacement que index.html.' : installEvent ? 'LogiTrak est prêt. Cliquez sur Installer maintenant.' : 'Le navigateur ne propose pas encore la fenêtre automatique. Sur Windows, ouvrez ce site dans Edge ou Chrome. Sur Android, ouvrez-le directement dans Chrome, hors des applications de messagerie, puis utilisez le menu Installer l’application.';
    const action = document.getElementById('pwaInstallNow');
    if(action) action.hidden = !installEvent;
  }
  function showHelp() {
    let dialog = document.getElementById('pwaInstallHelp');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'pwaInstallHelp';
      dialog.className = 'pwa-dialog panel';
      dialog.setAttribute('aria-labelledby', 'pwaInstallTitle');
      dialog.innerHTML = '<h2 id="pwaInstallTitle">Installer LogiTrak</h2>' +
        '<p id="pwaInstallStatus" role="status"></p>' +
        '<ol><li><b>Windows</b> · Ouvrez le site dans Edge ou Chrome, puis utilisez l’icône d’installation dans la barre d’adresse ou l’option d’installation du menu du navigateur.</li>' +
        '<li><b>Android</b> · Ouvrez le site dans Chrome, puis choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil » dans le menu ⋮.</li></ol>' +
        '<p>Si l’installation n’est pas encore proposée, attendez la fin du chargement, puis consultez à nouveau le menu du navigateur.</p>' +
        '<p>Une connexion Internet est nécessaire pour consulter et enregistrer les données de production.</p>' +
        '<button id="pwaInstallNow" type="button" class="btn btn-primary" hidden>Installer maintenant</button> <button id="pwaInstallClose" type="button" class="btn btn-secondary">Fermer</button>';
      dialog.querySelector('#pwaInstallClose').addEventListener('click', () => dialog.close());
      dialog.querySelector('#pwaInstallNow').addEventListener('click', install);
      helpMessage = dialog.querySelector('#pwaInstallStatus');
      document.body.appendChild(dialog);
    }
    refreshHelp();
    if (!dialog.open) dialog.showModal();
  }
  async function install() {
    if (!installEvent) return showHelp();
    const prompt = installEvent;
    installEvent = null;
    installButton.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') installButton.hidden = true;
    } catch (error) {
      console.warn('Installation LogiTrak', error);
      showHelp();
    } finally {
      installButton.disabled = false;
    }
  }
  function offerUpdate() {
    if (updateButton) updateButton.hidden = !registration?.waiting;
  }
  function createButtons() {
    const header = document.getElementById('headerActions');
    if (!header) return;
    installButton = document.createElement('button');
    installButton.id = 'pwaInstallButton';
    installButton.type = 'button';
    installButton.className = 'nav-btn';
    installButton.title = 'Installer LogiTrak sur cet appareil';
    installButton.innerHTML = '<i class="fa-solid fa-download" aria-hidden="true"></i><span>Installer</span>';
    installButton.hidden = standalone();
    installButton.addEventListener('click', install);
    header.insertBefore(installButton, header.firstChild);

    updateButton = document.createElement('button');
    updateButton.id = 'pwaUpdateButton';
    updateButton.type = 'button';
    updateButton.className = 'nav-btn';
    updateButton.hidden = true;
    updateButton.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i><span>Mise à jour</span>';
    updateButton.title = 'Une nouvelle version est disponible';
    updateButton.addEventListener('click', () => {
      if (!registration?.waiting) return offerUpdate();
      if (!window.confirm('Une nouvelle version est disponible. Enregistrez vos saisies avant de continuer. Recharger LogiTrak maintenant ?')) return;
      applyingUpdate = true;
      registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
    });
    header.insertBefore(updateButton, installButton);
    offerUpdate();
  }
  async function registerWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext || location.protocol === 'file:') return;
    try {
      const base = appBase;
      registration = await navigator.serviceWorker.register(new URL('sw.js', base).href, { scope: base.href, updateViaCache: 'none' });
      offerUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') offerUpdate();
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (applyingUpdate) location.reload();
      });
      window.addEventListener('online', () => registration.update().catch(console.warn));
    } catch (error) {
      workerError = String(error);
      refreshHelp();
      console.warn('Installation du service worker LogiTrak', error);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createButtons, { once:true });
  else createButtons();
  registerWorker();
})();
