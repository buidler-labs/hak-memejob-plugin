import { MJ_TOKEN_DECIMALS } from "./constants";

/**
 * @param value
 * @returns Token amount in its smallest unit representation (tiny units).
 */
export const toTiny = (value: number) => {
	return value * 10 ** MJ_TOKEN_DECIMALS;
};


/**
 * 
 * @param raw 
 * @param message 
 * @returns Agent kit specific response type
 */
export const handleResponse = <T>(raw: T, message: string) => {
	return {
		raw,
		humanMessage: message,
	};
};
