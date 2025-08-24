/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { GetCategoriesTreeResponse } from '../models/GetCategoriesTreeResponse';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class CategoriesService {

    /**
     * Get categories tree for suppliers
     * Returns a hierarchical tree of categories (level1 → level2 → level3) for the given supplier IDs, localized by the requested language.
     * @param requestBody
     * @returns GetCategoriesTreeResponse Hierarchical categories tree
     * @throws ApiError
     */
    public static postSearchCategoriesTree(
        requestBody: {
            tenantId?: string;
            supplierIds?: Array<string>;
            /**
             * Language code (es, en, fr, pt, gl, ca)
             */
            lang?: string;
        },
    ): CancelablePromise<GetCategoriesTreeResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/search/categories-tree',
            body: requestBody,
            mediaType: 'application/json',
        });
    }

}
