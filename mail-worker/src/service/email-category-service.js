import { asc, gt, sql } from 'drizzle-orm';
import orm from '../entity/orm';
import email from '../entity/email';
import kvConst from '../const/kv-const';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const RULE_FIELDS = new Set(['subject', 'sendEmail', 'name', 'toEmail', 'text', 'content', 'all']);
const MATCH_TYPES = new Set(['eq', 'include', 'left', 'right', 'regex']);

const emailCategoryService = {
	defaultCategory() {
		return {
			name: '',
			color: '#409EFF',
			icon: '',
			sort: 0,
			enabled: 1
		};
	},

	normalizeCategory(params = {}) {
		const category = {
			...this.defaultCategory(),
			...params
		};

		category.name = String(category.name || '').trim();
		category.color = String(category.color || '').trim() || '#409EFF';
		category.icon = String(category.icon || '').trim();
		category.sort = Number(category.sort || 0);
		category.enabled = category.enabled === false || Number(category.enabled) === 0 ? 0 : 1;

		if (!category.name) {
			throw new BizError(t('categoryNameRequired'));
		}

		return category;
	},

	defaultRule() {
		return {
			categoryId: 0,
			field: 'subject',
			matchType: 'include',
			keyword: '',
			caseSensitive: 0,
			enabled: 1,
			priority: 0
		};
	},

	normalizeRule(params = {}) {
		const rule = {
			...this.defaultRule(),
			...params
		};

		rule.categoryId = Number(rule.categoryId || 0);
		rule.field = RULE_FIELDS.has(rule.field) ? rule.field : 'subject';
		rule.matchType = MATCH_TYPES.has(rule.matchType) ? rule.matchType : 'include';
		rule.keyword = String(rule.keyword || '').trim();
		rule.caseSensitive = rule.caseSensitive === true || Number(rule.caseSensitive) === 1 ? 1 : 0;
		rule.enabled = rule.enabled === false || Number(rule.enabled) === 0 ? 0 : 1;
		rule.priority = Number(rule.priority || 0);

		if (!rule.categoryId) {
			throw new BizError(t('categoryRequired'));
		}

		if (!rule.keyword) {
			throw new BizError(t('categoryRuleKeywordRequired'));
		}

		return rule;
	},

	async list(c) {
		const { results } = await c.env.db.prepare(`
			SELECT
				category_id AS categoryId,
				name,
				color,
				icon,
				sort,
				enabled,
				create_time AS createTime,
				update_time AS updateTime
			FROM email_category
			ORDER BY sort ASC, category_id ASC
		`).all();

		const categories = results || [];
		const rules = await this.ruleList(c);
		categories.forEach(category => {
			category.ruleList = rules.filter(rule => rule.categoryId === category.categoryId);
		});
		return categories;
	},

	async add(c, params) {
		const category = this.normalizeCategory(params);
		const row = await c.env.db.prepare(`
			INSERT INTO email_category (name, color, icon, sort, enabled)
			VALUES (?, ?, ?, ?, ?)
			RETURNING
				category_id AS categoryId,
				name,
				color,
				icon,
				sort,
				enabled,
				create_time AS createTime,
				update_time AS updateTime
		`).bind(category.name, category.color, category.icon, category.sort, category.enabled).first();
		await this.refreshRuleCache(c);
		row.ruleList = [];
		return row;
	},

	async update(c, params) {
		const categoryId = Number(params.categoryId || 0);
		if (!categoryId) {
			throw new BizError(t('categoryRequired'));
		}

		const category = this.normalizeCategory(params);
		const row = await c.env.db.prepare(`
			UPDATE email_category
			SET name = ?, color = ?, icon = ?, sort = ?, enabled = ?, update_time = CURRENT_TIMESTAMP
			WHERE category_id = ?
			RETURNING
				category_id AS categoryId,
				name,
				color,
				icon,
				sort,
				enabled,
				create_time AS createTime,
				update_time AS updateTime
		`).bind(category.name, category.color, category.icon, category.sort, category.enabled, categoryId).first();

		await this.refreshRuleCache(c);
		return row;
	},

	async delete(c, params) {
		const categoryId = Number(params.categoryId || 0);
		if (!categoryId) return;

		await c.env.db.batch([
			c.env.db.prepare('DELETE FROM email_category_rel WHERE category_id = ?').bind(categoryId),
			c.env.db.prepare('DELETE FROM email_category_rule WHERE category_id = ?').bind(categoryId),
			c.env.db.prepare('DELETE FROM email_category WHERE category_id = ?').bind(categoryId)
		]);
		await this.refreshRuleCache(c);
	},

	async ruleList(c, categoryId) {
		const hasCategory = Number(categoryId || 0) > 0;
		const sqlText = `
			SELECT
				rule_id AS ruleId,
				category_id AS categoryId,
				field,
				match_type AS matchType,
				keyword,
				case_sensitive AS caseSensitive,
				enabled,
				priority,
				create_time AS createTime
			FROM email_category_rule
			${hasCategory ? 'WHERE category_id = ?' : ''}
			ORDER BY priority DESC, rule_id ASC
		`;
		const query = c.env.db.prepare(sqlText);
		const { results } = hasCategory ? await query.bind(Number(categoryId)).all() : await query.all();
		return results || [];
	},

	async addRule(c, params) {
		const rule = this.normalizeRule(params);
		const row = await c.env.db.prepare(`
			INSERT INTO email_category_rule (category_id, field, match_type, keyword, case_sensitive, enabled, priority)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			RETURNING
				rule_id AS ruleId,
				category_id AS categoryId,
				field,
				match_type AS matchType,
				keyword,
				case_sensitive AS caseSensitive,
				enabled,
				priority,
				create_time AS createTime
		`).bind(rule.categoryId, rule.field, rule.matchType, rule.keyword, rule.caseSensitive, rule.enabled, rule.priority).first();
		await this.refreshRuleCache(c);
		return row;
	},

	async updateRule(c, params) {
		const ruleId = Number(params.ruleId || 0);
		if (!ruleId) return;

		const rule = this.normalizeRule(params);
		const row = await c.env.db.prepare(`
			UPDATE email_category_rule
			SET category_id = ?, field = ?, match_type = ?, keyword = ?, case_sensitive = ?, enabled = ?, priority = ?
			WHERE rule_id = ?
			RETURNING
				rule_id AS ruleId,
				category_id AS categoryId,
				field,
				match_type AS matchType,
				keyword,
				case_sensitive AS caseSensitive,
				enabled,
				priority,
				create_time AS createTime
		`).bind(rule.categoryId, rule.field, rule.matchType, rule.keyword, rule.caseSensitive, rule.enabled, rule.priority, ruleId).first();
		await this.refreshRuleCache(c);
		return row;
	},

	async deleteRule(c, params) {
		const ruleId = Number(params.ruleId || 0);
		if (!ruleId) return;

		await c.env.db.batch([
			c.env.db.prepare('DELETE FROM email_category_rel WHERE rule_id = ?').bind(ruleId),
			c.env.db.prepare('DELETE FROM email_category_rule WHERE rule_id = ?').bind(ruleId)
		]);
		await this.refreshRuleCache(c);
	},

	async refreshRuleCache(c) {
		await c.env.kv.delete(kvConst.EMAIL_CATEGORY_RULES);
	},

	async enabledRules(c) {
		const cached = await c.env.kv.get(kvConst.EMAIL_CATEGORY_RULES, { type: 'json' });
		if (Array.isArray(cached)) {
			return cached;
		}

		const { results } = await c.env.db.prepare(`
			SELECT
				r.rule_id AS ruleId,
				r.category_id AS categoryId,
				r.field,
				r.match_type AS matchType,
				r.keyword,
				r.case_sensitive AS caseSensitive,
				r.priority,
				c.name,
				c.color,
				c.icon,
				c.sort
			FROM email_category_rule r
			INNER JOIN email_category c ON c.category_id = r.category_id
			WHERE r.enabled = 1 AND c.enabled = 1
			ORDER BY r.priority DESC, c.sort ASC, r.rule_id ASC
		`).all();

		const rules = results || [];
		await c.env.kv.put(kvConst.EMAIL_CATEGORY_RULES, JSON.stringify(rules));
		return rules;
	},

	sourceByField(emailRow, field) {
		const subject = emailRow.subject || '';
		const sendEmail = emailRow.sendEmail || '';
		const name = emailRow.name || '';
		const toEmail = emailRow.toEmail || '';
		const text = emailRow.text || '';
		const content = emailRow.content || '';

		if (field === 'subject') return subject;
		if (field === 'sendEmail') return sendEmail;
		if (field === 'name') return name;
		if (field === 'toEmail') return toEmail;
		if (field === 'text') return text;
		if (field === 'content') return content;
		return `${subject}\n${sendEmail}\n${name}\n${toEmail}\n${text}\n${content}`;
	},

	matchRule(emailRow, rule) {
		const rawSource = String(this.sourceByField(emailRow, rule.field) || '');
		if (rule.matchType === 'regex') {
			try {
				return new RegExp(String(rule.keyword || ''), rule.caseSensitive ? '' : 'i').test(rawSource);
			} catch (e) {
				return false;
			}
		}

		let source = rawSource;
		let keyword = String(rule.keyword || '');

		if (!rule.caseSensitive) {
			source = source.toLowerCase();
			keyword = keyword.toLowerCase();
		}

		if (rule.matchType === 'eq') return source === keyword;
		if (rule.matchType === 'left') return source.startsWith(keyword);
		if (rule.matchType === 'right') return source.endsWith(keyword);

		return source.includes(keyword);
	},

	async classifyEmail(c, emailRow, options = {}) {
		if (!emailRow?.emailId) return [];

		if (options.clear) {
			await this.removeByEmailIds(c, [emailRow.emailId]);
		}

		const rules = await this.enabledRules(c);
		const matched = [];
		const matchedCategoryIds = new Set();

		for (const rule of rules) {
			if (matchedCategoryIds.has(rule.categoryId)) {
				continue;
			}

			if (!this.matchRule(emailRow, rule)) {
				continue;
			}

			await c.env.db.prepare(`
				INSERT OR IGNORE INTO email_category_rel (category_id, email_id, rule_id)
				VALUES (?, ?, ?)
			`).bind(rule.categoryId, emailRow.emailId, rule.ruleId).run();
			matchedCategoryIds.add(rule.categoryId);
			matched.push(rule);
		}

		return matched;
	},

	async removeByEmailIds(c, emailIds = []) {
		emailIds = emailIds.map(Number).filter(Boolean);
		if (emailIds.length === 0) return;

		const placeholders = emailIds.map(() => '?').join(',');
		await c.env.db.prepare(`DELETE FROM email_category_rel WHERE email_id IN (${placeholders})`).bind(...emailIds).run();
	},

	async emailAddCategory(c, list = []) {
		const emailIds = list.map(item => Number(item.emailId)).filter(Boolean);

		list.forEach(emailRow => {
			emailRow.categoryList = [];
		});

		if (emailIds.length === 0) return;

		const placeholders = emailIds.map(() => '?').join(',');
		const { results } = await c.env.db.prepare(`
			SELECT
				rel.email_id AS emailId,
				c.category_id AS categoryId,
				c.name,
				c.color,
				c.icon,
				c.sort
			FROM email_category_rel rel
			INNER JOIN email_category c ON c.category_id = rel.category_id
			WHERE rel.email_id IN (${placeholders}) AND c.enabled = 1
			ORDER BY c.sort ASC, c.category_id ASC
		`).bind(...emailIds).all();

		const map = {};
		for (const row of results || []) {
			if (!map[row.emailId]) {
				map[row.emailId] = [];
			}
			map[row.emailId].push(row);
		}

		list.forEach(emailRow => {
			emailRow.categoryList = map[emailRow.emailId] || [];
		});
	},

	filterCondition(categoryId) {
		if (categoryId === 'uncategorized') {
			return sql`NOT EXISTS (
				SELECT 1
				FROM email_category_rel rel
				INNER JOIN email_category c ON c.category_id = rel.category_id
				WHERE rel.email_id = ${email.emailId} AND c.enabled = 1
			)`;
		}

		categoryId = Number(categoryId || 0);
		if (!categoryId) return null;

		return sql`EXISTS (
			SELECT 1
			FROM email_category_rel rel
			INNER JOIN email_category c ON c.category_id = rel.category_id
			WHERE rel.email_id = ${email.emailId} AND rel.category_id = ${categoryId} AND c.enabled = 1
		)`;
	},

	async reclassify(c, params = {}) {
		const size = Math.min(Math.max(Number(params.size || 200), 1), 500);
		const lastEmailId = Number(params.lastEmailId || 0);
		const clearOld = params.clearOld !== false;

		const list = await orm(c).select().from(email)
			.where(gt(email.emailId, lastEmailId))
			.orderBy(asc(email.emailId))
			.limit(size)
			.all();

		if (list.length > 0 && clearOld) {
			await this.removeByEmailIds(c, list.map(item => item.emailId));
		}

		for (const emailRow of list) {
			await this.classifyEmail(c, emailRow);
		}

		return {
			lastEmailId: list.length > 0 ? list.at(-1).emailId : lastEmailId,
			processed: list.length,
			finished: list.length < size
		};
	}
};

export default emailCategoryService;
