<script lang="ts">
  let {icon,label,onclick,disabled=false,hint}: {
    icon:'import'|'export';label:string;onclick:()=>void;disabled?:boolean;hint?:string;
  }=$props();
</script>
<button type="button" class="navbar-icon-button" aria-label={label} title={hint ?? label} {disabled} {onclick}>
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 15v5h16v-5"/>
    {#if icon==='export'}<path d="M12 3v12m-5-5 5 5 5-5"/>{:else}<path d="M12 15V3m-5 5 5-5 5 5"/>{/if}
  </svg>
</button>
