# Tammy Builds public-tool standardization

This branch prepares the remaining Tammy Builds public tools to match the Contract & Budget Inspector workflow.

## Standard
- Public deployment source contains only public-safe code and assets.
- User-uploaded source/documents stay in-browser unless the tool explicitly says otherwise.
- Privacy-safe analytics track visits, starts, completions, failures, examples, and feedback interactions; never document/source contents.
- Every tool exposes an easy Try an example path.
- Every tool includes an optional feedback form named `tammy-builds-feedback` with fields for tool, feedback type, helpful, message, optional email, page, and bot trap.
- Feedback submissions are intended for Netlify Forms and can be configured to email the owner.
- Production build/deploy logs should remain private.
- ActorBridge code, configuration, secrets, or internal material must not be placed in this repository.

## Tools
- Contract & Budget Inspector — reference implementation.
- SQL Blast Radius — standardization staged here.
- COBOL X-Ray — standardization staged here.
- Vendor Price Creep Finder — standardization staged here.
