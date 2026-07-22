const cloudflareEmailService = {
	binding(env) {
		return env.EMAIL || env.email || null;
	},

	hasBinding(env) {
		return !!this.binding(env);
	},

	errorMessage(error) {
		const message = error?.message || String(error || 'Cloudflare Email send failed');
		return error?.code ? `${error.code}: ${message}` : message;
	}
};

export default cloudflareEmailService;
