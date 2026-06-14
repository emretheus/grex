import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	reactStrictMode: true,
	// Emit a fully static site into apps/marketing/out for GitHub Pages.
	output: "export",
	// next/image's default loader needs a server; static export can't run it.
	// The site uses plain <img>, but `output: export` requires this regardless.
	images: { unoptimized: true },
	// Single-page site served at the apex root (grex.codes), so no
	// basePath/assetPrefix. trailingSlash emits out/index.html, the most
	// robust form for the Pages static file server.
	trailingSlash: true,
};

export default nextConfig;
