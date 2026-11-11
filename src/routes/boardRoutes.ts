import { Router } from 'express';
import * as boardController from '../controllers/boardController';
import { authenticate } from '../middleware/auth';
import * as memberController from '../controllers/boardMemberController';
import * as columnController from '../controllers/columnController';
import * as cardController from '../controllers/cardController';
import * as statsController from '../controllers/statsController';

export const boardRoutes = Router();
boardRoutes.use(authenticate); // every board route below needs a logged-in user (TR: aşağıdaki her pano route'u giriş yapmış kullanıcı ister)

boardRoutes.post('/', boardController.create);
boardRoutes.get('/', boardController.list);
boardRoutes.get('/:id', boardController.getOne);
boardRoutes.patch('/:id', boardController.rename);
boardRoutes.delete('/:id', boardController.remove);
// Things that need a board id to be listed or created live under /api/boards/:id/...
// '/:id' matches a single path segment, so these never land on getOne above.
// TR: Listelemek veya oluşturmak için pano id'si gereken şeyler /api/boards/:id/... altında durur.
// TR: '/:id' tek bir path parçasıyla eşleşir, bu yüzden bunlar asla yukarıdaki getOne'a düşmez.
boardRoutes.get('/:id/members', memberController.list);
boardRoutes.post('/:id/members', memberController.add);
boardRoutes.delete('/:id/members/:userId', memberController.remove);
boardRoutes.get('/:id/columns', columnController.list);
boardRoutes.post('/:id/columns', columnController.create);
boardRoutes.get('/:id/cards', cardController.list);
boardRoutes.get('/:id/stats', statsController.board);
