/** @type {import('next').NextConfig} */
module.exports = { reactStrictMode: true, devIndicators: false, distDir: process.env.PANGEA_BUILD_DIR || '.next' };
