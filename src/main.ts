import { mount } from 'svelte';
import App from './App.svelte';
import './styles/global.css';
import { identifyUpdate } from './services/appUpdates';
mount(App, { target: document.getElementById('app')! });

// Do not force activation of newer workers during active gameplay.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then(registration => {
      let announced:ServiceWorker|undefined;
      const announce = () => {
        const worker=registration.waiting;
        if(worker && worker!==announced && navigator.serviceWorker.controller){
          announced=worker;
          void identifyUpdate(worker).then(update=>{
            if(registration.waiting===worker)window.dispatchEvent(new CustomEvent('trivia-update',{detail:update}));
          }).catch(()=>{announced=undefined;});
        }
      };
      announce();
      registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', announce));
    }).catch(() => {
      // The app remains usable online if registration is unavailable.
    });
  });
}
