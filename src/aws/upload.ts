import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import { S3 } from 'aws-sdk';
import config from '../config';
import { FileUpload } from 'graphql-upload';

export type ImageUploadResponse = {
  fileName: string;
  path: string;
  mimeType: string;
  url: string;
};

/**
 * @param s3
 * @param image
 */
export async function uploadImage(
  s3: S3,
  image: FileUpload
): Promise<ImageUploadResponse> {
  const { filename, mimetype, createReadStream } = image;
  const stream = createReadStream();
  const key = `${uuidv4()}.${mime.extension(mimetype)}`;

  const params = {
    Bucket: config.aws.s3.bucket,
    Key: key,
    Body: stream,
    ContentType: mimetype,
    ACL: 'public-read',
  };

  const response = await s3.upload(params).promise();

  return {
    fileName: filename,
    path: key,
    mimeType: mimetype,
    url: response.Location,
  };
}
