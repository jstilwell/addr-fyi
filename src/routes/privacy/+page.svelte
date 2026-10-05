<script lang="ts">
	import LegalDoc from '#lib/components/LegalDoc.svelte';
	import Seo from '#lib/components/Seo.svelte';
	import { PRIVACY } from '#lib/content/legal.js';
</script>

<Seo
	title="privacy — addr.fyi"
	description="What addr.fyi does (and does not) collect: no accounts, no cookies, no ads, cookieless analytics only."
	path="/privacy"
/>

<LegalDoc doc={PRIVACY} />
