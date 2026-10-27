import {
	v2 as Cloudinary,
	type UploadApiOptions,
	type UploadApiResponse,
} from "cloudinary";
import httpStatus from "http-status";
import config from "../config";
import { AppError } from "../utils/AppError";

Cloudinary.config({
	cloud_name: config.cloudinary_cloud_name,
	api_key: config.cloudinary_api_key,
	api_secret: config.cloudinary_api_secret,
});

export const cloudinary = Cloudinary;

export const uploadToCloudinary = (
	buffer: Buffer,
	options: UploadApiOptions = {},
) =>
	new Promise<UploadApiResponse>((resolve, reject) => {
		cloudinary.uploader
			.upload_stream({ resource_type: "auto", ...options }, (error, result) => {
				if (error) return reject(error);
				if (!result)
					return reject(new Error("No result returned from Cloudinary"));
				resolve(result);
			})
			.end(buffer);
	});

// Browsers upload files straight to Cloudinary (Vercel Functions cap request bodies),
// then send the API only the public ID. The API trusts nothing the browser says about the file.
const UPLOAD_RULES = {
	doctorDocument: {
		folder: "healthstream/doctor-applications",
		formats: ["jpg", "png", "webp", "pdf"],
	},
	profileImage: {
		folder: "healthstream/profile-images",
		formats: ["jpg", "png", "webp"],
	},
} as const;

type UploadKind = keyof typeof UPLOAD_RULES;

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const signUpload = (kind: UploadKind) => {
	const { folder, formats } = UPLOAD_RULES[kind];
	const params = {
		timestamp: Math.round(Date.now() / 1000),
		folder,
		allowed_formats: formats.join(","),
	};

	return {
		...params,
		cloudName: config.cloudinary_cloud_name,
		apiKey: config.cloudinary_api_key,
		maxBytes: MAX_UPLOAD_BYTES,
		signature: cloudinary.utils.api_sign_request(
			params,
			config.cloudinary_api_secret,
		),
	};
};

// Looks the file up on Cloudinary and returns its real URL; rejects (and deletes) anything off-rules.
export const verifyUpload = async (kind: UploadKind, publicId: string) => {
	const { folder, formats } = UPLOAD_RULES[kind];

	if (!publicId.startsWith(`${folder}/`)) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid upload");
	}

	const asset: {
		secure_url: string;
		public_id: string;
		bytes: number;
		format: string;
	} = await cloudinary.api
		.resource(publicId, { resource_type: "image" })
		.catch(() => {
			throw new AppError(httpStatus.BAD_REQUEST, "Uploaded file was not found");
		});

	if (
		asset.bytes > MAX_UPLOAD_BYTES ||
		!(formats as readonly string[]).includes(asset.format)
	) {
		await cloudinary.uploader.destroy(publicId).catch(() => {});
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Files must be ${formats.join(", ").toUpperCase()} and 5 MB or smaller`,
		);
	}

	return { url: asset.secure_url, publicId: asset.public_id };
};
