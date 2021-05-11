import { PrismaClient } from '@prisma/client';
import {
  CreateCollectionAuthorInput,
  UpdateCollectionAuthorInput,
} from './types';
import { clear as clearDb, createAuthorHelper } from '../test/helpers';
import { createAuthor, updateAuthor } from './mutations';

const db = new PrismaClient();

describe('mutations: CollectionAuthor', () => {
  beforeEach(async () => {
    await clearDb(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe('createAuthor', () => {
    it('should create a collection author with a default slug', async () => {
      const data: CreateCollectionAuthorInput = {
        name: 'the dude',
      };

      const author = await createAuthor(db, data);

      expect(author.name).toEqual('the dude');
      expect(author.slug).toEqual('the-dude');
    });

    it('should create a collection author with all fields specified', async () => {
      const data: CreateCollectionAuthorInput = {
        name: 'the dude',
        slug: 'his-dudeness',
        bio: 'the dude abides',
        imageUrl: 'https://i.imgur.com/YeydXfW.gif',
      };

      const author = await createAuthor(db, data);

      expect(author.name).toEqual('the dude');
      expect(author.slug).toEqual('his-dudeness');
      expect(author.bio).toEqual('the dude abides');
      expect(author.imageUrl).toEqual('https://i.imgur.com/YeydXfW.gif');
    });

    it('should fail to create a collection author on duplicate slug', async () => {
      const data: CreateCollectionAuthorInput = {
        name: 'the dude',
        slug: 'his-dudeness',
      };

      await createAuthor(db, data);

      // change the name just because
      data.name = 'walter man';

      // should fail trying to create an author with the same slug
      await expect(createAuthor(db, data)).rejects.toThrow(
        `An author with the slug "${data.slug}" already exists`
      );
    });

    describe('updateAuthor', () => {
      it('should update a collection author', async () => {
        const author = await createAuthorHelper(db, 'the dude');

        const data: UpdateCollectionAuthorInput = {
          externalId: author.externalId,
          name: 'el duderino',
          slug: 'el-duderino',
          bio: 'he abides, man',
        };

        const updated = await updateAuthor(db, data);

        expect(updated.name).toEqual(data.name);
        expect(updated.bio).toEqual(data.bio);
      });

      it('should update to a specified collection author slug', async () => {
        const author = await createAuthorHelper(db, 'the dude');

        const data: UpdateCollectionAuthorInput = {
          externalId: author.externalId,
          name: 'el duderino',
          slug: 'his-dudeness',
        };

        const updated = await updateAuthor(db, data);

        expect(updated.slug).toEqual(data.slug);
      });

      it('should fail to update a collection author slug if another author has that slug', async () => {
        // will create a slug of 'the-dude'
        await createAuthorHelper(db, 'the dude');
        // will create a slug of 'walter'
        const author2 = await createAuthorHelper(db, 'walter');

        // try to make walter's slug 'the-dude'
        const data: UpdateCollectionAuthorInput = {
          externalId: author2.externalId,
          name: author2.name,
          slug: 'the-dude',
        };

        // should fail trying to make walter's slug 'the dude'
        // there's only one the dude
        await expect(updateAuthor(db, data)).rejects.toThrow(
          `An author with the slug "${data.slug}" already exists`
        );
      });
    });
  });
});
