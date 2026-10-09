/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type CategoriesTreeRequest = {
    /**
     * Language code
     */
    lang?: CategoriesTreeRequest.lang;
    /**
     * Product type
     */
    type?: string;
    /**
     * Comma separated supplier ids
     */
    supplierIds?: string;
    /**
     * Comma separated Level1 cat ids
     */
    l1Id?: string;
    /**
     * Comma separated Level2 cat ids
     */
    l2Id?: string;
    /**
     * Comma separated Level3 cat ids
     */
    l3Id?: string;
    /**
     * Client visibility
     */
    visibility?: number;
    /**
     * Include deleted products. If not set, only non-deleted are returned.
     */
    deleted?: boolean;
};

export namespace CategoriesTreeRequest {

    /**
     * Language code
     */
    export enum lang {
        CA = 'ca',
        EN = 'en',
        ES = 'es',
        FR = 'fr',
        GL = 'gl',
        PT = 'pt',
    }


}

