export interface ICreateAdminPayload {
	name: string;
	email: string;
	personalEmail: string;
	contactNumber?: string;
	role: "ADMIN" | "SUPER_ADMIN";
}
