<script lang="ts">
	import LegalDoc from '#lib/components/LegalDoc.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import { TERMS } from '#lib/content/legal.js';
</script>

<Seo
	title="terms — addr.fyi"
	description="Terms of service for addr.fyi: free, as-is, fair use encouraged."
	path="/terms"
/>

<LegalDoc doc={TERMS} />
