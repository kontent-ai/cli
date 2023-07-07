# Kontent.ai CLI

[![npm](https://img.shields.io/npm/v/@kontent-ai/cli.svg)](https://www.npmjs.com/package/@kontent-ai/cli)
[![Build](https://github.com/kontent-ai/cli/actions/workflows/test.yml/badge.svg)](https://github.com/kontent-ai/cli/actions/workflows/test.yml)

The Kontent.ai CLI helps you when you need to change content models within your [Kontent.ai](https://kontent.ai/) environments and migrate existing content to match the changes. The CLI provides you with guidance on how to write and run migration scripts.

**_NOTE:_** The Kontent.ai CLI tool supports only Javascript files, so if you write your migrations in Typescript or any other language you have to transpile your code before running.

- [Kontent.ai CLI](#kontentai-cli)
  - [Installation](#installation)
  - [🌟 Migration example](#-migration-example)
    - [1. Prepare a testing environment](#1-prepare-a-testing-environment)
    - [2. Prepare Kontent.ai CLI boilerplate](#2-prepare-kontentai-cli-boilerplate)
    - [3. Run a migration](#3-run-a-migration)
    - [4. Explore existing migrations](#4-explore-existing-migrations)
  - [Usage](#usage)
    - [Commands](#commands)
    - [Custom implementation of reading/saving status of migrations](#custom-implementation-of-readingsaving-status-of-migrations)
    - [Debugging](#debugging)
  - [The vision](#the-vision)
  - [Feedback \& Contribution](#feedback--contribution)

## Installation

The Kontent.ai CLI requires Node 10+ and npm 6+, and uses the [Kontent.ai Management SDK](https://github.com/kontent-ai/management-sdk-js) to manipulate content in your environments.

```sh
npm install -g @kontent-ai/cli
```

## 🌟 Migration example

The current version of the CLI is useful for creating and running migration templates. Let's go through creating your first migration for a Kontent.ai project.

### 1. Prepare a testing environment

When you need to add new features to your project and app, it's better to verify the changes in a separate non-production environment. In Kontent.ai, [clone your project](https://kontent.ai/learn/tutorials/manage-kontent/projects/clone-projects) from the list of your projects.

### 2. Prepare Kontent.ai CLI boilerplate

To improve the learning curve of our new CLI, we've prepared a [Kontent.ai CLI boilerplate](https://github.com/kontent-ai/migrations-boilerplate) with examples on how to use the CLI. Clone the boilerplate GitHub repository on your drive. In the next step, you'll run a migration script from the boilerplate's `Migrations` directory.

### 3. Run a migration

Open a command line and navigate to the root of the boilerplate folder (should be `migrations-boilerplate`) and execute the following commands:

```sh
# Navigates to the root of the Kontent.ai CLI boilerplate folder.
cd ./migrations-boilerplate

npm install

# Registers an environment (a pair of two keys, a environment ID and API key used to manage the environment) for migrations.
kontent environment add --name DEV --api-key <Api key> --environment-id <Environment ID> (Use the copy of your production project from the first step)

# Runs a specific migration.
npm run migrate 01_sample_init_createBlogType
```

Kontent.ai CLI supports only running JavaScript migration files so in case you want to write in TypesScript, CoffeScript or in any other language you have to transpile your code before running.
In the case of TypeScript, you may use this example from [Kontent.ai CLI boilerplate](https://github.com/kontent-ai/migrations-boilerplate/blob/master/package.json#L7)

That's it! You've run your first Kontent.ai migration. This migration created a content type called *Blog* that contains three text elements named *Title*, *Author* and *Text*. The sample migration is written in TypeScript.

The boilerplate is configured to transpile TypeScript migrations into plain JavaScript so that the Kontent.ai CLI can execute the migrations. Note that if you don't want to use TypeScript for your migrations, it's fine to write the migrations directly in JavaScript.

### 4. Explore existing migrations

You should now be able to go through the other boilerplate sample migrations. The migration scripts in the *Migrations* directory all focus on one scenario – replacing a piece of text from the *Author* text element with *Author* content items, which contain more information about the author. This way you can replace the texts within your items by more complex objects containing, for example, images and rich text.

You can use similar approach for your own specific scenarios. For example, imagine you need to add display information to the images inserted in your articles. You may want to specify relative size or caption for each image. To do this, you would need to open each article and replace every image with a component that would contain the image and a few elements for image metadata. You'd create small migration scripts for separate parts of the scenario (such as creating a new type, updating the articles, and so on) and the migrations will take care of the process for all articles within your environment.

## Usage

Use the `--help` parameter to display the help section for CLI tool.

```sh
kontent --help
```

Combine the `--help` parameter with a specific command to learn more about that command.

```sh
kontent migration add --help
```

### Commands

The supported commands are divided into groups according to their target, at this first version there are just to spaces "migration" and "environment" containing following commands:

* `environment add` –  Store information about the environment locally.
  * The environment is defined as a named pair of values. For example, "DEV" environment can be defined as a pair of a specific environment ID and Management API key. This named pair of values is stored within your local repository in a configuration file named `.environments.json`. 
  * You can specify a named pair of environment ID and Management API key using these options: `--environment-id <your environment ID> --api-key <management api key> --name <name of the environment>`.

* `migration add --name <migration name>` – Generates a script file (in JavaScript or TypeScript) for running a migration on a [Kontent.ai](https://kontent.ai/) environment.
  * The file is stored in the `Migrations` directory within the root of your repository. 
  * Add your migration script in the body of the `run` function using the [Kontent.ai Management SDK](https://github.com/kontent-ai/management-sdk-js) that was injected via the `apiClient` parameter.
  * Add your rollback script in the body of the `rollback` function using the [Kontent.ai Management SDK](https://github.com/kontent-ai/management-sdk-js) that was injected via the `apiClient` parameter.
  * To choose between JavaScript and TypeScript when generating the script file, use the `--template-type` option, such as `--template-type "javascript"`.
  * The migration template contains an `order` property that is used to run a batch of migrations (range or all) in the specified order. Order can be one of the two types - `number` or `date`.
    * Ordering by `number` has a higher priority. The `order` must be a unique positive integer or zero. There may be gaps between migrations, for example, the following sequence is perfectly fine 0,3,4,5,10
    * Ordering by `date` has a lower priority. To add date ordering use the switch option `-d`. The CLI will generate a new file which name consists of the date in UTC and the name you have specified. Moreover, the property `order` inside the file will be set to the Date accordingly.
    * Executing all migrations will firstly migrate migrations with orders specified by number and only then migrations with order specified by date.
    * By specifying range you can migrate either number-ordered migrations or date-numbered migrations. They can't be combined.

    ```typescript
    // Example migration template 
    import {MigrationModule} from "@kontent-ai/cli";
      
    const migration: MigrationModule = {
      order: 1,
      run: async (apiClient) => {
          // TODO: Your migration code.
      },
    };
    
    export default migration;
    ```

* `migration run` - Runs a migration script specified by file name (option `--name <file name>`), or runs multiple migration scripts in the order specified in the migration files (options `--all` or `--range`).
  * By adding `--range` you need to add value in form of `number:number` in case of number ordering or in the format of `Tyyyy-mm-dd-hh-mm-ss:yyyy-mm-dd-hh-mm-ss` in case of date order.
    > When using the range with dates, only the year value is mandatory and all other values are optional. It is fine to have a range specified like `T2023-01:2023-02`. It will take all migrations created in January of 2023. Notice the T at the beginning of the Date range. It helps to separate date ordering from number order.
  * You can execute a migration against a specific environment (options `--environment <YOUR_ENVIRONMENT_ID> --api-key <YOUR_MANAGEMENT_API_KEY>`) or environment stored in the local configuration file (option `--environment <YOUR_ENVIRONMENT_NAME>`).
  * To execute your `rollback` scripts instead of `run` scripts, use the switch option `--rollback` or shortly `-b`.
  * After each run of a migration script, the CLI logs the execution into a status file. This file holds data for the next run to prevent running the same migration script more than once. You can choose to override this behavior, for example for debugging purposes, by using the `--force` parameter.
    > Note: For every migration there is only one record in the status file. Calling run/rollback continuously overrides the that record with new data.
  * You can choose whether you want to keep executing the migration scripts even if one migration script fails (option `--continue-on-error`) or whether you want to get additional information logged by HttpService into the console (option `--log-http-service-errors-to-console`).

* `backup --action [backup|restore|clean]` - This command enables you to use [Kontent.ai backup manager](https://github.com/kontent-ai/backup-manager-js)
  * The purpose of this tool is to backup & restore [Kontent.ai projects](https://kontent.ai/). This project uses CM API to both get & restore data.

### Custom implementation of reading/saving status of migrations

You might want to implement your way to store information about migrations status. For instance, you would like to save it into DB such as MongoDB, Firebase, etc,... and not use the default JSON file. Therefore, we provide you with an option to implement functions `readStatus` and `saveStatus`. To do so, create a new file called `plugins.js` at the root of your migrations project, and implement mentioned functions there. To fit into the required declarations, you can use the template below:

```js
//plugins.js
exports.saveStatus = async (data) => {}

exports.readStatus = async () => {}
```
> Note: Both functions must be implemented.

It is also possible to use Typescript. We have prepared types `SaveStatusType` and `ReadStatusType` to typesafe your functions. To create plugins in Typescript, create a file `plugins.ts` and implement your functions there. We suggest using and implementing the template below:

```ts
//plugins.ts
import type { ReadStatusType, SaveStatusType } from "@kontent-ai/cli";

export const saveStatus: SaveStatusType = async (data: string) => {}

export const readStatus: ReadStatusType = async () => {}
```

> Note: Don't forget to transpile `plugins.ts` into `plugins.js` otherwise your plugins will not work.

### Debugging

By default, we do not provide any additional logs from the HttpService. If you require these logs, you can change this behavior by using (option `--log-http-service-errors-to-console`).

If you come across an error and you're not sure how to fix it, execute your migration script as follows and setup your debugger to the specified port.

```sh
node --inspect .\node_modules\@kontent-ai\cli\lib\index.js migration run -n 07_sample_migration_publish -e DEV
```

## The vision

* Writing migration scripts can involve a lot of repetitive work, especially when it requires getting different object types and iterating through them. That's why we've decided to continue improving the developer experience and focus on that in upcoming releases. We plan to reduce the code that you need to write to the bare minimum by providing you with a "command builder". This builder will allow you to write migrations using queries and callbacks that should be applied to every object selected by that query. For example, select content types, all items based on the types, and all variants of the items, and execute your callback function on them.

* The tool isn't reserved only for migrations. A valid use case could also be Kontent.ai project data export and import, which could together with the possibility to clone/create/archive projects via the management API be a great way to e.g. run integration tests on the test environment that would be archived after the successful tests run.

## Feedback & Contribution

Check out the [contributing](./CONTRIBUTING.md) page to see the best places to file issues, start discussions, and begin contributing. We have lot of ideas on how to improve the CLI and developer experience with our product, but we'd love to hear from you so we can focus on your needs.
