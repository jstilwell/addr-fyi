import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ getClientAddress }) => {
	return {
		ip: getClientAddress()
	};
};
