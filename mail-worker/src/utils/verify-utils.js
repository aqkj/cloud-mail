const verifyUtils = {
	normalizeEmail(str) {
		return String(str || '')
			.trim()
			.replace(/＠/g, '@')
			.replace(/。/g, '.')
			.replace(/．/g, '.')
			.replace(/｡/g, '.');
	},
	isEmail(str) {
		str = this.normalizeEmail(str);
		return /^(?!.*\.\.)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-](?:[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]*[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-])?@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(str);
	},
	isDomain(str) {
		return /^(?!:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(str);
	}
}

export default  verifyUtils
