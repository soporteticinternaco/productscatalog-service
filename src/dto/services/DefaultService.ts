/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProductSearchResponse } from '../models/ProductSearchResponse';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class DefaultService {

    /**
     * Search products
     * @param q Search query
     * @param lang Language code to search in (defaults to 'es')
     * @param page Page number for pagination
     * @param limit Number of results per page
     * @param supplierId supplier id
     * @param ref product ref
     * @param ean product ean
     * @param level1Id level1 category filter
     * @param level2Id level2 category filter
     * @param level3Id level3 category filter
     * @param visibility supplier visibility
     * @param ids product ids
     * @returns ProductSearchResponse List of matching products (full document in selected language)
     * @throws ApiError
     */
    public static getSearch(
        q?: string,
        lang: 'ca' | 'en' | 'es' | 'fr' | 'gl' | 'pt' = 'es',
        page: number = 1,
        limit: number = 10,
        supplierId?: string,
        ref?: string,
        ean?: string,
        level1Id?: string,
        level2Id?: string,
        level3Id?: string,
        visibility?: string,
        ids?: Array<string>,
    ): CancelablePromise<Array<ProductSearchResponse>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/search',
            query: {
                'q': q,
                'lang': lang,
                'page': page,
                'limit': limit,
                'supplier_id': supplierId,
                'ref': ref,
                'ean': ean,
                'level1Id': level1Id,
                'level2Id': level2Id,
                'level3Id': level3Id,
                'visibility': visibility,
                'ids': ids,
            },
        });
    }

}
