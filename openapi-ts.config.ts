import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './openapi/openapi.yaml', // sign up at app.heyapi.dev
  output: 'src/dto',
  plugins: ["@hey-api/schemas"]
});