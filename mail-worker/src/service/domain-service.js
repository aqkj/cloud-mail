import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import verifyUtils from '../utils/verify-utils';

const DOMAIN_CACHE_TTL = 60 * 1000;
const DEFAULT_DOMAIN_KV_KEY = 'cloud-mail:domains';

let domainCache = {
	key: '',
	expireAt: 0,
	list: [],
	exactSet: new Set(),
	wildcardBases: [],
	exists: false
};

function configuredDomainKvKey(env) {
	return env.domain_kv_key || env.domainKvKey || env.DOMAIN_KV_KEY || '';
}

function domainKvKey(env) {
	return configuredDomainKvKey(env) || DEFAULT_DOMAIN_KV_KEY;
}

function normalizeDomain(domain) {
	return verifyUtils.normalizeEmail(domain)
		.replace(/^@+/, '')
		.replace(/\.$/, '')
		.toLowerCase();
}

function isWildcardDomainRule(domain) {
	return typeof domain === 'string' && domain.startsWith('*.') && verifyUtils.isDomain(domain.slice(2));
}

function isExactDomainRule(domain) {
	return verifyUtils.isDomain(domain);
}

function isDomainRule(domain) {
	return isExactDomainRule(domain) || isWildcardDomainRule(domain);
}

function toDomainMeta(list) {
	const exactSet = new Set();
	const wildcardBases = [];

	list.forEach(domain => {
		if (isWildcardDomainRule(domain)) {
			wildcardBases.push(domain.slice(2));
		} else {
			exactSet.add(domain);
		}
	});

	wildcardBases.sort((a, b) => b.length - a.length);

	return { exactSet, wildcardBases };
}

function matchDomainMeta(meta, domain) {
	if (!domain) {
		return false;
	}

	if (meta.exactSet.has(domain)) {
		return true;
	}

	return meta.wildcardBases.some(base => domain !== base && domain.endsWith('.' + base));
}

function exactDomainList(list) {
	return list.filter(isExactDomainRule);
}

function parseDomainList(value) {
	if (!value) {
		return [];
	}

	if (Array.isArray(value)) {
		return value;
	}

	if (typeof value === 'string') {
		const list = JSON.parse(value);
		return Array.isArray(list) ? list : [];
	}

	return [];
}

function normalizeDomainList(list) {
	return Array.from(new Set(
		list.map(normalizeDomain).filter(Boolean)
	));
}

function validateDomainList(list) {
	const invalid = list.find(domain => !isDomainRule(domain));
	if (invalid) {
		throw new BizError(t('invalidDomain', { domain: invalid }));
	}
	return list;
}

const domainService = {
	key(c) {
		return domainKvKey(c.env);
	},

	async list(c) {
		const env = c.env;
		const kvKey = domainKvKey(env);
		const hasConfiguredKvKey = !!configuredDomainKvKey(env);

		if (env.kv) {
			const now = Date.now();
			if (domainCache.key === kvKey && domainCache.expireAt > now) {
				if (domainCache.exists) {
					return domainCache.list;
				}
				return env.domain ? this.listFromEnv(env) : [];
			}

			const value = await env.kv.get(kvKey, { type: 'json' });
			if (value == null) {
				domainCache = {
					key: kvKey,
					expireAt: now + DOMAIN_CACHE_TTL,
					list: [],
					exactSet: new Set(),
					wildcardBases: [],
					exists: false
				};

				if (env.domain) {
					return this.listFromEnv(env);
				}

				return [];
			}

			if (!Array.isArray(value)) {
				throw new BizError(t('notJsonDomainKv'));
			}

			const list = validateDomainList(normalizeDomainList(value));
			this.setCache(kvKey, list, true);
			return list;
		}

		if (hasConfiguredKvKey) {
			throw new BizError(t('noDomainKvBinding'));
		}

		return this.listFromEnv(env);
	},

	listFromEnv(env) {
		if (!env.domain) {
			throw new BizError(t('noDomainVariable'));
		}

		try {
			return validateDomainList(normalizeDomainList(parseDomainList(env.domain)));
		} catch (e) {
			if (e.name === 'BizError') {
				throw e;
			}
			throw new BizError(t('notJsonDomain'));
		}
	},

	setCache(key, list, exists) {
		const meta = toDomainMeta(list);
		domainCache = {
			key,
			expireAt: Date.now() + DOMAIN_CACHE_TTL,
			list,
			exactSet: meta.exactSet,
			wildcardBases: meta.wildcardBases,
			exists
		};
	},

	async save(c, list) {
		if (!c.env.kv) {
			throw new BizError(t('noDomainKvBinding'));
		}

		const kvKey = domainKvKey(c.env);
		list = validateDomainList(normalizeDomainList(list));
		await c.env.kv.put(kvKey, JSON.stringify(list));
		this.setCache(kvKey, list, true);
		return this.info(c);
	},

	async add(c, list) {
		const curList = await this.list(c);
		return this.save(c, [...curList, ...list]);
	},

	async delete(c, list) {
		const deleteSet = new Set(normalizeDomainList(list));
		const nextList = (await this.list(c)).filter(domain => !deleteSet.has(domain));
		return this.save(c, nextList);
	},

	async info(c) {
		const list = await this.list(c);
		const publicList = exactDomainList(list).map(domain => '@' + domain);
		return {
			key: domainKvKey(c.env),
			domains: list,
			domainRules: list,
			wildcardDomains: list.filter(isWildcardDomainRule),
			domainList: publicList,
			count: list.length
		};
	},

	async ensureKv(c) {
		const list = await this.list(c);

		if (!c.env.kv) {
			throw new BizError(t('noDomainKvBinding'));
		}

		await c.env.kv.put(domainKvKey(c.env), JSON.stringify(list));
		this.setCache(domainKvKey(c.env), list, true);
		return this.info(c);
	},

	parseInput(value) {
		if (Array.isArray(value)) {
			return value;
		}

		return String(value || '')
			.split(/[\n,，;；\s]+/)
			.map(item => item.trim())
			.filter(Boolean);
	},

	async publicList(c) {
		return exactDomainList(await this.list(c)).map(domain => '@' + domain);
	},

	async publicInfo(c) {
		const list = await this.list(c);
		return {
			domainRules: list,
			wildcardDomains: list.filter(isWildcardDomainRule),
			domainList: exactDomainList(list).map(domain => '@' + domain)
		};
	},

	async hasDomain(c, domain) {
		const target = normalizeDomain(domain);
		const kvKey = domainKvKey(c.env);

		if (domainCache.key === kvKey && domainCache.expireAt > Date.now() && domainCache.exists) {
			return matchDomainMeta(domainCache, target);
		}

		const list = await this.list(c);
		return this.hasDomainInList(list, target);
	},

	hasDomainInList(list, domain) {
		const normalizedList = normalizeDomainList(Array.isArray(list) ? list : this.parseInput(list));
		const validList = normalizedList.filter(isDomainRule);
		return matchDomainMeta(toDomainMeta(validList), normalizeDomain(domain));
	},

	isDomainRule(domain) {
		return isDomainRule(normalizeDomain(domain));
	},

	isWildcardDomainRule(domain) {
		return isWildcardDomainRule(normalizeDomain(domain));
	}
};

export default domainService;
