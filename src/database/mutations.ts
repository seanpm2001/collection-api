import {
  CollectionAuthor,
  CollectionStatus,
  Image,
  ImageEntityType,
  PrismaClient,
} from '@prisma/client';
import slugify from 'slugify';
import config from '../config';
import { getCollection, getCollectionStory } from './queries';

import {
  CollectionStoryWithAuthors,
  CollectionWithAuthorsAndStories,
  CreateCollectionAuthorInput,
  CreateCollectionInput,
  CreateCollectionStoryInput,
  CreateImageInput,
  UpdateCollectionAuthorInput,
  UpdateCollectionInput,
  UpdateCollectionStoryInput,
} from './types';

/**
 * @param db
 * @param data
 */
export async function createAuthor(
  db: PrismaClient,
  data: CreateCollectionAuthorInput
): Promise<CollectionAuthor> {
  data.slug = data.slug || slugify(data.name, config.slugify);

  const slugExists = await db.collectionAuthor.count({
    where: { slug: data.slug },
  });

  if (slugExists) {
    throw new Error(`An author with the slug "${data.slug}" already exists`);
  }

  return db.collectionAuthor.create({ data: { ...data } });
}

/**
 * @param db
 * @param data
 */
export async function updateAuthor(
  db: PrismaClient,
  data: UpdateCollectionAuthorInput
): Promise<CollectionAuthor> {
  if (!data.externalId) {
    throw new Error('externalId must be provided.');
  }

  const slugExists = await db.collectionAuthor.count({
    where: { slug: data.slug, externalId: { not: data.externalId } },
  });

  if (slugExists) {
    throw new Error(`An author with the slug "${data.slug}" already exists`);
  }

  return db.collectionAuthor.update({
    where: { externalId: data.externalId },
    data: { ...data },
  });
}

/**
 * @param db
 * @param data
 */
export async function createCollection(
  db: PrismaClient,
  data: CreateCollectionInput
): Promise<CollectionWithAuthorsAndStories> {
  const slugExists = await db.collection.count({
    where: { slug: data.slug },
  });

  if (slugExists) {
    throw new Error(`A collection with the slug ${data.slug} already exists`);
  }

  // We have to pull the authorExternalId property out of data
  // because prisma's generated create/update types do not
  // have the authorExternalId as a property. We have it
  // as part of the mutation input to allow connecting
  // an author to a collection.
  const authorExternalId = data.authorExternalId;
  delete data.authorExternalId;

  return db.collection.create({
    data: {
      ...data,
      authors: { connect: { externalId: authorExternalId } },
    },
    include: {
      authors: true,
      stories: {
        include: {
          authors: {
            orderBy: [{ name: 'asc' }],
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
}

/**
 * @param db
 * @param data
 */
export async function updateCollection(
  db: PrismaClient,
  data: UpdateCollectionInput
): Promise<CollectionWithAuthorsAndStories> {
  // retrieve the current record, pre-update
  const existingCollection = await getCollection(db, data.externalId);

  if (!existingCollection) {
    throw new Error(`A collection by that ID could not be found`);
  }

  // if the slug is changing, we have to make sure it's unique
  // we could let this fall back to a db unique constraint, but probably good
  // to handle it here, too
  if (existingCollection.slug !== data.slug) {
    // make sure no other collections exist with the soon-to-be slug
    const sameSlugs = await db.collection.count({
      where: {
        slug: data.slug,
        externalId: { notIn: [existingCollection.externalId] },
      },
    });

    // if we found more than one collection with this slug, we have a problem
    if (sameSlugs > 0) {
      throw new Error(`A collection with the slug ${data.slug} already exists`);
    }
  }

  // We have to pull the authorExternalId property out of data
  // because prisma's generated create/update types do not
  // have the authorExternalId as a property. We have it
  // as part of the mutation input to allow connecting
  // an author to a collection.
  const authorExternalId = data.authorExternalId;
  delete data.authorExternalId;

  // if the collection is going from unpublished to published, we update its
  // `publishedAt` time
  if (
    existingCollection.status !== CollectionStatus.PUBLISHED &&
    data.status === CollectionStatus.PUBLISHED
  ) {
    data.publishedAt = new Date();
  }

  return db.collection.update({
    where: { externalId: data.externalId },
    data: {
      ...data,
      // reference: https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries#disconnect-all-related-records
      // set: [] disconnects all authors from the collection
      // before connecting new authors, essentially a sync
      // of authors for a collection
      authors: { set: [], connect: { externalId: authorExternalId } },
    },
    include: {
      authors: true,
      stories: {
        include: {
          authors: {
            orderBy: [{ name: 'asc' }],
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
}

/**
 * @param db
 * @param data
 */
export async function createCollectionStory(
  db: PrismaClient,
  data: CreateCollectionStoryInput
): Promise<CollectionStoryWithAuthors> {
  // Use the giver collection external ID to fetch the collection ID
  const collection = await getCollection(db, data.collectionExternalId);

  // delete the collectionExternalId property
  // so data matches the expected prisma type
  delete data.collectionExternalId;
  return await db.collectionStory.create({
    data: {
      ...data,
      collectionId: collection.id,
      authors: {
        create: data.authors,
      },
    },
    include: {
      authors: {
        orderBy: [{ name: 'asc' }],
      },
    },
  });
}

/**
 * @param db
 * @param data
 */
export async function updateCollectionStory(
  db: PrismaClient,
  data: UpdateCollectionStoryInput
): Promise<CollectionStoryWithAuthors> {
  // get collectionStory internal id for deleting authors
  const existingStory = await getCollectionStory(db, data.externalId);

  // delete related authors
  await db.collectionStoryAuthor.deleteMany({
    where: {
      collectionStoryId: existingStory.id,
    },
  });

  return await db.collectionStory.update({
    where: { externalId: data.externalId },
    data: {
      ...data,
      authors: {
        create: data.authors,
      },
    },
    include: {
      authors: {
        orderBy: [{ name: 'asc' }],
      },
    },
  });
}

/**
 * @param db
 * @param externalId
 */
export async function deleteCollectionStory(
  db: PrismaClient,
  externalId: string
): Promise<CollectionStoryWithAuthors> {
  // get the existing story for the internal id
  const existingStory = await getCollectionStory(db, externalId);

  // delete all associated collection story authors
  await db.collectionStoryAuthor.deleteMany({
    where: {
      collectionStoryId: existingStory.id,
    },
  });

  // delete the story
  await db.collectionStory.delete({
    where: { externalId },
  });

  // to conform with the scheam, we need to return a CollectionStory with
  // authors, which can't be done in the `.delete` call above because we
  // already deleted the authors.
  return existingStory;
}

/**
 * @param db
 * @param data
 */
export async function createImage(
  db: PrismaClient,
  data: CreateImageInput
): Promise<Image> {
  return db.image.create({ data });
}

/**
 * @param db
 * @param entity
 * @param entityType
 */
export async function associateImageWithEntity<
  T extends { id: number; imageUrl: string }
>(
  db: PrismaClient,
  entity: T,
  entityType: ImageEntityType
): Promise<Image | void> {
  if (!entity.imageUrl) return;

  const image = await db.image.findUnique({
    where: { path: entity.imageUrl },
  });

  if (image) {
    return await db.image.update({
      where: { id: image.id },
      data: { entityId: entity.id, entityType },
    });
  }
}
