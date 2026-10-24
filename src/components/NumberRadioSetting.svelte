<script lang="ts">
  let {title,description,options,value=$bindable()}:{title:string;description:string;options:readonly number[];value:number}=$props();
  const id=$props.id();
</script>
<section class="number-setting" aria-labelledby={`${id}-title`}>
  <h2 id={`${id}-title`}>{title}</h2>
  <p id={`${id}-description`}>{description}</p>
  <div class="number-radio-options" role="radiogroup" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
    {#each options as option}
      <label class="number-radio" class:selected={value===option}>
        <input type="radio" name={id} value={option} bind:group={value} aria-label={String(option)}/>
        <span>{option}</span>
      </label>
    {/each}
  </div>
</section>
