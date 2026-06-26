import { sql } from 'drizzle-orm';

const D1_LIKE_PATTERN_BYTE_LIMIT = 50;
const LIKE_ESCAPE = '\\';

function normalizeSearchValue(value) {
	return String(value ?? '');
}

function getByteLength(value) {
	return new TextEncoder().encode(value).length;
}

function escapeLikePattern(value) {
	return value.replace(/[\\%_]/g, '\\$&');
}

function canUseD1Like(pattern) {
	return getByteLength(pattern) <= D1_LIKE_PATTERN_BYTE_LIMIT;
}

function likeNoCase(column, pattern) {
	return sql`${column} COLLATE NOCASE LIKE ${pattern} ESCAPE ${LIKE_ESCAPE}`;
}

export function equalsText(column, value) {
	const keyword = normalizeSearchValue(value);

	if (!keyword) {
		return null;
	}

	return sql`${column} COLLATE NOCASE = ${keyword}`;
}

export function containsText(column, value) {
	const keyword = normalizeSearchValue(value);

	if (!keyword) {
		return null;
	}

	const pattern = `%${escapeLikePattern(keyword)}%`;

	if (canUseD1Like(pattern)) {
		return likeNoCase(column, pattern);
	}

	return sql`instr(lower(coalesce(${column}, '')), lower(${keyword})) > 0`;
}

export function startsWithText(column, value) {
	const keyword = normalizeSearchValue(value);

	if (!keyword) {
		return null;
	}

	const pattern = `${escapeLikePattern(keyword)}%`;

	if (canUseD1Like(pattern)) {
		return likeNoCase(column, pattern);
	}

	return sql`instr(lower(coalesce(${column}, '')), lower(${keyword})) = 1`;
}

export function endsWithText(column, value) {
	const keyword = normalizeSearchValue(value);

	if (!keyword) {
		return null;
	}

	const pattern = `%${escapeLikePattern(keyword)}`;

	if (canUseD1Like(pattern)) {
		return likeNoCase(column, pattern);
	}

	return sql`substr(lower(coalesce(${column}, '')), -length(lower(${keyword}))) = lower(${keyword})`;
}

export function matchesLikePattern(column, value) {
	const pattern = normalizeSearchValue(value);

	if (!pattern) {
		return null;
	}

	if (canUseD1Like(pattern)) {
		return sql`${column} COLLATE NOCASE LIKE ${pattern}`;
	}

	if (!pattern.includes('_')) {
		const startsAny = pattern.startsWith('%');
		const endsAny = pattern.endsWith('%');
		const keyword = pattern.replace(/^%+|%+$/g, '');

		if (keyword && !keyword.includes('%')) {
			if (startsAny && endsAny) return containsText(column, keyword);
			if (startsAny) return endsWithText(column, keyword);
			if (endsAny) return startsWithText(column, keyword);
			return equalsText(column, keyword);
		}
	}

	const keyword = pattern.replace(/[%_]+/g, ' ').trim();
	return keyword ? containsText(column, keyword) : null;
}
