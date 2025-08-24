/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type CategoryNode = {
    /**
     * Category identifier (level1, level2, or level3)
     */
    id?: string;
    /**
     * Localized category description
     */
    description?: string;
    children?: Array<CategoryNode>;
};

