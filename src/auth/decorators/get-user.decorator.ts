// src/auth/decorators/get-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    // 1. Get the underlying HTTP request
    const request = ctx.switchToHttp().getRequest();
    
    // 2. Grab the user object that Passport attached after validating the JWT
    const user = request.user;

    // 3. If we asked for a specific field (like @GetUser('id')), return just that. 
    // Otherwise, return the whole user object.
    return data ? user?.[data] : user;
  },
);