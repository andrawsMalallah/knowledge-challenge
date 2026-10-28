<script lang="ts">
  import { loadBank, validateGitHubToken } from '../services/admin';
  import type { Snapshot } from '../services/admin';
  let { onlogin, onback }: { onlogin:(token:string,snapshot:Snapshot)=>void; onback:()=>void } = $props();
  let token=$state(''); let busy=$state(false); let error=$state('');
  async function login() {
    try {validateGitHubToken(token);} catch(cause){error=cause instanceof Error?cause.message:'أدخل رمز GitHub صالحاً.';return;}
    busy=true;error='';
    try { const clean=token.trim();const snapshot=await loadBank(clean);token='';onlogin(clean,snapshot); }
    catch(cause){error=cause instanceof Error?cause.message:'تعذر الاتصال بالمستودع.';}
    finally{busy=false;}
  }
</script>
<main class="container admin-page">
  <header><strong class="brand">✦ تحدي المعرفة</strong><button type="button" class="secondary" onclick={onback} disabled={busy}>العودة للعبة</button></header>
  <section class="card login-card" aria-labelledby="login-title">
    <h1 id="login-title">الدخول إلى الإدارة</h1><p>أدخل رمز GitHub للوصول إلى ملفات بنك الأسئلة.</p>
    <label for="github-token">رمز GitHub</label><input id="github-token" type="password" autocomplete="off" bind:value={token} oninput={()=>{error='';}} onkeydown={event=>{if(event.key==='Enter' && !busy)void login();}}/>
    <p class="muted">يبقى الرمز في ذاكرة الصفحة فقط ويُمسح عند تحديثها أو الخروج.</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button type="button" onclick={login} disabled={busy}>{busy?'جارٍ الاتصال…':'دخول'}</button>
  </section>
</main>
<style>
  .login-card{max-width:34rem;margin:3rem auto;display:grid;gap:.8rem}.login-card h1,.login-card p{margin:.2rem 0}.login-card input{width:100%}.login-card button{justify-self:start}.admin-page header{gap:1rem;flex-wrap:wrap}
</style>
