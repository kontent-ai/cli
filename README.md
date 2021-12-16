# Kentico Kontent CLI

[![npm](https://img.shields.io/npm/v/@kentico/kontent-cli.svg)](https://www.npmjs.com/package/@kentico/kontent-cli)
[![Build](https://github.com/Kentico/kontent-cli/actions/workflows/test.yml/badge.svg)](https://github.com/Kentico/kontent-cli/actions/workflows/test.yml)

The Kontent CLI helps you when you need to change content models within your [Kentico Kontent](https://kontent.ai/) projects and migrate existing content to match the changes. The CLI provides you with guidance on how to write and run migration scripts.

**_NOTE:_** The Kontent CLI tool supports only Javascript files, so if you write your migrations in Typescript or any other language you have to transpile your code before running.

- [Kentico Kontent CLI](#kentico-kontent-cli)
  - [Installation](#installation)
  - [🌟 Migration example](#-migration-example)
    - [1. Prepare a testing environment](#1-prepare-a-testing-environment)
    - [2. Prepare Kontent CLI boilerplate](#2-prepare-kontent-cli-boilerplate)
    - [3. Run a migration](#3-run-a-migration)
    - [4. Explore existing migrations](#4-explore-existing-migrations)
  - [Usage](#usage)
    - [Commands](#commands)
    - [Debugging](#debugging)
  - [The vision](#the-vision)
  - [Feedback & Contribution](#feedback--contribution)

## Installation

The Kontent CLI requires Node 10+ and npm 6+, and uses the [Kontent Management SDK](https://github.com/Kentico/kontent-management-sdk-js) to manipulate content in your projects.

```sh
npm install -g @kentico/kontent-cli
```

## 🌟 Migration example

The current version of the CLI is useful for creating and running migration templates. Let's go through creating your first migration for a Kentico Kontent project.

### 1. Prepare a testing environment

When you need to add new features to your project and app, it's better to verify the changes in a separate non-production environment. In Kentico Kontent, [clone your project](https://docs.kontent.ai/tutorials/set-up-projects/manage-projects/cloning-existing-projects#a-cloning-an-entire-project) from the list of your projects.

### 2. Prepare Kontent CLI boilerplate

To improve the learning curve of our new CLI, we've prepared a [Kontent CLI boilerplate](https://github.com/Kentico/kontent-migrations-boilerplate) with examples on how to use the CLI. Clone the boilerplate GitHub repository on your drive. In the next step, you'll run a migration script from the boilerplate's `Migrations` directory.

### 3. Run a migration

Open a command line and navigate to the root of the boilerplate folder (should be `kontent-migrations-boilerplate`) and execute the following commands:

```sh
# Navigates to the root of the Kontent CLI boilerplate folder.
cd ./kontent-migrations-boilerplate

npm install

# Registers an environment (a pair of two keys, a project ID and API key used to manage the project) for migrations.
kontent environment add --name DEV --api-key <Api key> --project-id <Project ID> (Use the copy of your production project from the first step)

# Runs a specific migration.
npm run migrate 01_sample_init_createBlogType
```

Kontent CLI supports only running JavaScript migration files so in case you want to write in TypesSript, CoffeScript or in any other language you have to transpile your code before running.
In the case of TypeScript, you may use this example from [Kontent CLI boilerplate](https://github.com/Kentico/kontent-migrations-boilerplate/blob/master/package.json#L7)

That's it! You've run your first Kontent migration. This migration created a content type called *Blog* that contains three text elements named *Title*, *Author* and *Text*. The sample migration is written in TypeScript.

The boilerplate is configured to transpile TypeScript migrations into plain JavaScript so that the Kontent CLI can execute the migrations. Note that if you don't want to use TypeScript for your migrations, it's fine to write the migrations directly in JavaScript.

### 4. Explore existing migrations

You should now be able to go through the other boilerplate sample migrations. The migration scripts in the *Migrations* directory all focus on one scenario – replacing a piece of text from the *Author* text element with *Author* content items, which contain more information about the author. This way you can replace the texts within your items by more complex objects containing, for example, images and rich text.

You can use similar approach for your own specific scenarios. For example, imagine you need to add display information to the images inserted in your articles. You may want to specify relative size or caption for each image. To do this, you would need to open each article and replace every image with a component that would contain the image and a few elements for image metadata. You'd create small migration scripts for separate parts of the scenario (such as creating a new type, updating the articles, and so on) and the migrations will take care of the process for all articles within your project.

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
  * The environment is defined as a named pair of values. For example, "DEV" environment can be defined as a pair of a specific project ID and Management API key. This named pair of values is stored within your local repository in a configuration file named `.environments.json`. 
  * You can specify a named pair of project ID and Management API key using these options: `--project-id <your project ID> --api-key <management api key> --name <name of the environment>`.

* `migration add --name <migration name>` – Generates a script file (in JavaScript or TypeScript) for running a migration on a [Kentico Kontent](https://kontent.ai/) project.
  * The file is stored in the `Migrations` directory within the root of your repository. 
  * Add your migration script in the body of the `run` function using the [Kontent Management SDK](https://github.com/Kentico/kontent-management-sdk-js) that was injected via the `apiClient` parameter.
  * To choose between JavaScript and TypeScript when generating the script file, use the `--template-type` option, such as `--template-type "javascript"`.
  * The migration template contains an `order` property that is used to run a batch of migrations in the specified order.

    ```typescript
    // Example migration template 
    import {MigrationModule} from "@kentico/kontent-cli";
      
    const migration: MigrationModule = {
      order: 1,
      run: async (apiClient) => {
          // TODO: Your migration code.
      },
    };
    
    export default migration;
    ```

* `migration run` - Runs a migration script specified by file name (option `--name <file name>`), or runs multiple migration scripts in the order specified in the migration files (option `--all`).
  * You can execute a migration against a specific project (options `--project <YOUR_PROJECT_ID> --api-key <YOUR_MANAGEMENT_API_KEY>`) or environment stored in the local configuration file (option `--environment <YOUR_ENVIRONMENT_NAME>`).
  * After each run of a migration script, the CLI logs the execution into a status file. This file holds data for the next run to prevent running the same migration script more than once. You can choose to override this behavior, for example for debugging purposes, by using the `--force` parameter.
  * You can choose whether you want to keep executing the migration scripts even if one migration script fails (option `--continue-on-error`) or whether you want to run in the debug mode (option `--debug`) and get additional information for certain issues logged into the console.

* `backup --action [backup|restore|clean]` - This command enables you to use [Kontent backup manager](https://github.com/Kentico/kontent-backup-manager-js)
  * The purpose of this tool is to backup & restore [Kentico Kontent projects](https://kontent.ai/). This project uses CM API to both get & restore data.

### Debugging

If you come across an error and you're not sure how to fix it, execute your migration script as follows and setup your debugger to the specified port.

```sh
node --inspect .\node_modules\@kentico\kontent-cli\lib\index.js migration run -n 07_sample_migration_publish -e DEV
```

## The vision

* Writing migration scripts can involve a lot of repetitive work, especially when it requires getting different object types and iterating through them. That's why we've decided to continue improving the developer experience and focus on that in upcoming releases. We plan to reduce the code that you need to write to the bare minimum by providing you with a "command builder". This builder will allow you to write migrations using queries and callbacks that should be applied to every object selected by that query. For example, select content types, all items based on the types, and all variants of the items, and execute your callback function on them.

* The tool isn't reserved only for migrations. A valid use case could also be Kontent project data export and import, which could together with the possibility to clone/create/archive projects via the management API be a great way to e.g. run integration tests on the test environment that would be archived after the successful tests run.

## Feedback & Contribution

Check out the [contributing](./CONTRIBUTING.md) page to see the best places to file issues, start discussions, and begin contributing. We have lot of ideas on how to improve the CLI and developer experience with our product, but we'd love to hear from you so we can focus on your needs.
