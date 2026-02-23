import { Global, Module } from "@nestjs/common";
import { EncryptionService } from "./encryption.service";
import { SessionStoreService } from "./session-store.service";

@Global()
@Module({
  providers: [EncryptionService, SessionStoreService],
  exports: [EncryptionService, SessionStoreService],
})
export class EncryptionModule {}
