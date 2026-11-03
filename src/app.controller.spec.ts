import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return the hello message', () => {
      // String.fromCharCode(33) is the exclamation mark (kept out of the
      // update command because zsh can rewrite it when pasting).
      expect(appController.getHello()).toBe(
        'Hello World' + String.fromCharCode(33),
      );
    });
  });
});
