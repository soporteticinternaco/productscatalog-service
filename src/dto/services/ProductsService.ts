/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProductSearchResponse } from '../models/ProductSearchResponse';
import type { SearchCategoriesResponse } from '../models/SearchCategoriesResponse';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class ProductsService {

    /**
     * Search products
     * @param tenantId Tenant identifier
     * @param q Search query
     * @param lang Language code to search in (defaults to 'es')
     * @param page Page number for pagination (0-based)
     * @param size Results per page
     * @param supplierId Supplier id
     * @param ref Comma separated product refs
     * @param ean Comma separated product eans
     * @param l1Id Level1 cat id
     * @param l2Id Level2 cat id
     * @param l3Id Level3 cat id
     * @param id Comma separated product ids
     * @param visibility Client visibility
     * @param sortBy Sort by field; suffix with `+`/`-` for direction (e.g. `price+`)
     * @param type Product type
     * @param grouping Group products by grouping_code
     * @param rate Product rate id
     * @returns ProductSearchResponse Matching products (full document in selected language)
     * @throws ApiError
     */
    public static getTenantsSearchProducts(
        tenantId: string,
        q?: string,
        lang: 'ca' | 'en' | 'es' | 'fr' | 'gl' | 'pt' = 'es',
        page?: number,
        size: number = 12,
        supplierId?: string,
        ref?: string,
        ean?: string,
        l1Id?: string,
        l2Id?: string,
        l3Id?: string,
        id?: string,
        visibility?: number,
        sortBy?: string,
        type?: string,
        grouping: boolean = false,
        rate?: string,
    ): CancelablePromise<ProductSearchResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/tenants/{tenantId}/search/products',
            path: {
                'tenantId': tenantId,
            },
            query: {
                'q': q,
                'lang': lang,
                'page': page,
                'size': size,
                'supplierId': supplierId,
                'ref': ref,
                'ean': ean,
                'l1Id': l1Id,
                'l2Id': l2Id,
                'l3Id': l3Id,
                'id': id,
                'visibility': visibility,
                'sortBy': sortBy,
                'type': type,
                'grouping': grouping,
                'rate': rate,
            },
        });
    }

    /**
     * For a specific search, returns categories with each category total count. Used in category filters.
     * Returns the level1/level2/level3 category hierarchy for the given search, with a product count per level3 category.
     * @param tenantId Tenant identifier
     * @param q Search query
     * @param lang Language code to search in (defaults to 'es')
     * @param supplierId Supplier id
     * @param ref Comma separated product refs
     * @param ean Comma separated product eans
     * @param l1Id Level1 cat id
     * @param l2Id Level2 cat id
     * @param l3Id Level3 cat id
     * @param id Comma separated product ids
     * @param visibility Client visibility
     * @param type Product type
     * @param rate Product rate id
     * @returns SearchCategoriesResponse Array of categories (with product count) matching the search
     * @throws ApiError
     */
    public static getTenantsSearchCategories(
        tenantId: string,
        q?: string,
        lang: 'ca' | 'en' | 'es' | 'fr' | 'gl' | 'pt' = 'es',
        supplierId?: string,
        ref?: string,
        ean?: string,
        l1Id?: string,
        l2Id?: string,
        l3Id?: string,
        id?: string,
        visibility?: number,
        type?: string,
        rate?: string,
    ): CancelablePromise<SearchCategoriesResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/tenants/{tenantId}/search/categories',
            path: {
                'tenantId': tenantId,
            },
            query: {
                'q': q,
                'lang': lang,
                'supplierId': supplierId,
                'ref': ref,
                'ean': ean,
                'l1Id': l1Id,
                'l2Id': l2Id,
                'l3Id': l3Id,
                'id': id,
                'visibility': visibility,
                'type': type,
                'rate': rate,
            },
        });
    }

}
