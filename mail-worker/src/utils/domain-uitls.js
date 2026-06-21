const domainUtils = {
	toDomainList(domain) {
		if (!domain) {
			return [];
		}

		if (Array.isArray(domain)) {
			return domain;
		}

		if (typeof domain === 'string') {
			try {
				const list = JSON.parse(domain);
				return Array.isArray(list) ? list : [];
			} catch {
				return [];
			}
		}

		return [];
	},

	hasDomain(domainList, domain) {
		domain = String(domain || '').toLowerCase();
		return this.toDomainList(domainList)
			.map(item => String(item || '').toLowerCase())
			.includes(domain);
	},

	toOssDomain(domain) {

		if (!domain) {
			return null
		}

		if (!domain.startsWith('http')) {
			return 'https://' + domain
		}

		if (domain.endsWith("/")) {
			domain = domain.slice(0, -1);
		}

		return domain
	}
}

export default  domainUtils
