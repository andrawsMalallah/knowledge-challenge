<script lang="ts">
  let {title,description,checked=$bindable(true)}:{title:string;description:string;checked?:boolean}=$props();
  const id=$props.id();
</script>
<label class="preference-toggle">
  <input type="checkbox" bind:checked aria-label={title} aria-describedby={`${id}-description`}/>
  <span>{title}<small id={`${id}-description`}>{description}</small></span>
</label>
