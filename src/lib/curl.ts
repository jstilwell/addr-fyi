/**
 * A curl command that pastes cleanly into a shell. The URL is single-quoted
 * only when it holds something a shell would expand — zsh, for one, refuses
 * to run an unquoted `?type=MX` ("no matches found").
 */
export function curlCommand(url: string, flags = ''): string {
	const arg = /^[\w./:%@~+=,-]+$/.test(url) ? url : `'${url.replaceAll("'", `'\\''`)}'`;
	return ['curl', flags, arg].filter(Boolean).join(' ');
}
