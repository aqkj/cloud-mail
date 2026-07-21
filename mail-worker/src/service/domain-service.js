import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import verifyUtils from '../utils/verify-utils';

const DOMAIN_CACHE_TTL = 60 * 1000;
const DEFAULT_DOMAIN_KV_KEY = 'cloud-mail:domains';

let domainCache = {
	key: '',
	expireAt: 0,
	list: [],
	set: new Set(),
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
	const invalid = list.find(domain => !verifyUtils.isDomain(domain));
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
					set: new Set(),
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
		domainCache = {
			key,
			expireAt: Date.now() + DOMAIN_CACHE_TTL,
			list,
			set: new Set(list),
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
		return {
			key: domainKvKey(c.env),
			domains: list,
			domainList: list.map(domain => '@' + domain),
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
		return (await this.list(c)).map(domain => '@' + domain);
	},

	async hasDomain(c, domain) {
		const target = normalizeDomain(domain);
		const kvKey = domainKvKey(c.env);

		if (domainCache.key === kvKey && domainCache.expireAt > Date.now() && domainCache.exists) {
			return domainCache.set.has(target);
		}

		const list = await this.list(c);
		return new Set(list).has(target);
	}
};

export default domainService;
