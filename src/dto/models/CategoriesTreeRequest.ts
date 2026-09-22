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
     * Level1 cat Id
     */
    l1Id?: string;
    /**
     * Level2 cat Id
     */
    l2Id?: string;
    /**
     * Level3 cat Id
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

