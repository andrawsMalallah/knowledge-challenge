<script lang="ts">
  let { label, onclick, disabled=false, secondary=false }: { label:string; onclick:()=>void; disabled?:boolean; secondary?:boolean } = $props();
</script>
<button class:secondary disabled={disabled} {onclick}>{label}</button>
