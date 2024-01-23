# Dark Alley Collab

Dark Alley is a research project and collab is the collaboration backend of it.

## Developing locally
### Run
1. Clone this repo to your computer.
1. Run `npm install`
1. In a terminal, run `npm run dev` this repo's folder.
1. Start building.

### Run (advanced)
Like most AEM Edge Delivery projects, `da-collab` uses production service integrations by default. You work against the projects you have access to and there's less likely something breaks if you're working against production services already.

There are times when you need to develop a feature across the different services of DA. In these scenarios, you need local or stage variations of these services. With the right credentials, you can do so with the following flags:

#### DA Admin
1. Run `da-admin` locally. Details [here](https://github.com/adobe/da-admin).
1. Start the local AEM CLI (see above) 
1. Visit `https://localhost:3000/?da-admin=local`

#### DA Collab
1. Run `da-collab` locally. 
2. Start the local AEM CLI (see above)
3. Visit `https://localhost:3000/?da-collab=local`

#### Notes
1. You can mix and match these services. You can use local da-collab with stage da-admin, etc. - the only exception is that you can not use local da-admin with a none local da-collab.
2. Each service will set a localStorage value and will not clear until you use `?name-of-service=reset`.

## Additional details
### Recommendations
1. We recommend running `npm install` for linting.
