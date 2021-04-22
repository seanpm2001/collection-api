import { PrismaClient, Collection, CollectionStatus } from '@prisma/client';
import { getCollection } from './queries';
import { CreateCollectionInput, UpdateCollectionInput } from './types';
import {
  clear as clearDb,
  createAuthorHelper,
  createCollectionHelper,
} from '../test/helpers';
import { createCollection, updateCollection } from './mutations';

const db = new PrismaClient();

describe('mutations', () => {
  let author;

  beforeEach(async () => {
    await clearDb(db);
    author = await createAuthorHelper(db, 'walter');
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe('collection mutations', () => {
    describe('createCollection', () => {
      it('should create a collection with a default status of `draft`', async () => {
        const data: CreateCollectionInput = {
          slug: 'walter-bowls',
          title: 'walter bowls',
          authorExternalId: author.externalId,
        };

        const collection = await createCollection(db, data);

        expect(collection).not.toBeNull();
        expect(collection.status).toEqual(CollectionStatus.draft);
      });

      it('should create a collection with a null publishedAt', async () => {
        const data: CreateCollectionInput = {
          slug: 'walter-bowls',
          title: 'walter bowls',
          authorExternalId: author.externalId,
        };
        const collection = await createCollection(db, data);

        expect(collection.publishedAt).toBeFalsy();
      });

      it('should fail on a duplicate slug', async () => {
        // create our first collection
        const data1: CreateCollectionInput = {
          slug: 'walter-bowls',
          title: 'walter bowls',
          authorExternalId: author.externalId,
        };

        await createCollection(db, data1);

        // create our second collection, trying to use the same slug
        const data2: CreateCollectionInput = {
          slug: 'walter-bowls',
          title: 'walter bowls, again',
          authorExternalId: author.externalId,
        };

        await expect(createCollection(db, data2)).rejects.toThrow(
          `A collection with the slug ${data2.slug} already exists`
        );
      });
    });

    describe('updateCollection', () => {
      it('should update a collection', async () => {
        const initial = await createCollectionHelper(
          db,
          'first iteration',
          author
        );

        const data: UpdateCollectionInput = {
          externalId: initial.externalId,
          slug: initial.slug,
          title: 'second iteration',
          authorExternalId: author.externalId,
        };

        // should return the updated info
        const updated = await updateCollection(db, data);
        expect(updated.title).toEqual('second iteration');

        // should have updated the updatedAt field
        expect(updated.updatedAt.getTime()).toBeGreaterThan(
          initial.updatedAt.getTime()
        );

        // verify on a re-fetch that the update was persisted
        // is this necessary?
        const reFetch = await getCollection(db, initial.externalId);
        expect(reFetch.title).toEqual('second iteration');
      });

      it('should update publishedAt when going to published status', async () => {
        const initial = await createCollectionHelper(
          db,
          'first iteration',
          author,
          CollectionStatus.draft
        );

        const data: UpdateCollectionInput = {
          externalId: initial.externalId,
          slug: initial.slug,
          title: 'second iteration',
          authorExternalId: author.externalId,
          status: CollectionStatus.published,
        };

        // publishedAt should have a value
        const updated = await updateCollection(db, data);
        expect(updated.publishedAt).not.toBeFalsy();

        // verify on a re-fetch that the update was persisted
        // is this necessary?
        const reFetch = await getCollection(db, initial.externalId);
        expect(reFetch.publishedAt).not.toBeFalsy();
      });

      it('should not update publishedAt when already published', async () => {
        const initial = await createCollectionHelper(
          db,
          'first iteration',
          author,
          CollectionStatus.draft
        );

        // update the colletion to published
        let data: UpdateCollectionInput = {
          externalId: initial.externalId,
          slug: initial.slug,
          title: 'second iteration',
          authorExternalId: author.externalId,
          status: CollectionStatus.published,
        };

        const published = await updateCollection(db, data);

        // update the colletion title (leaving all other fields the same)
        data = {
          externalId: initial.externalId,
          slug: initial.slug,
          title: 'third iteration',
          authorExternalId: author.externalId,
          status: CollectionStatus.published,
        };

        const updated = await updateCollection(db, data);

        // make sure the publishedAt value hasn't changed
        expect(published.publishedAt).toEqual(updated.publishedAt);
      });

      it('should fail on a duplicate slug', async () => {
        // this should create a slug of 'let-us-go-bowling'
        const first = await createCollectionHelper(
          db,
          'let us go bowling',
          author,
          CollectionStatus.draft
        );

        const second: Collection = await createCollectionHelper(
          db,
          'phone is ringing',
          author,
          CollectionStatus.draft
        );

        // try to update the second collection with the same slug as the first
        const data: UpdateCollectionInput = {
          ...second,
          slug: first.slug,
          authorExternalId: author.externalId,
        };

        await expect(updateCollection(db, data)).rejects.toThrow(
          `A collection with the slug ${first.slug} already exists`
        );
      });
    });
  });
});
