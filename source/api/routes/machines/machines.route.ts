import { Router } from 'express';
import * as Joi from 'joi';

import asyncHandler from '@/utils/asyncHandler';
import logger from '@/utils/logger';
import databaseService from '@/service/database.service';
import { ConfigBody, ErrorBody, InfoResult } from '@/types';
import { InvalidPathParamError, NotFoundError } from '@/errors';
import { InvalidBodyError } from '@/errors/client/InvalidBodyError';

import filesystemService from '@/service/filesystem.service';

function checkPathParam(value: any, name: string): void {
    if (!value || typeof value !== 'string') {
        throw new InvalidPathParamError('Invalid path parameter', {
            name,
            value
        });
    }
}

function validateConfigBody(body: ConfigBody): ConfigBody {
    const schema = Joi.object({
        paused: Joi.bool().required(),
        backup: Joi.bool().required(),
        resolution: Joi.number().min(0).max(63).required(),
        hours: Joi.array().items(Joi.string()).required(),
        pxFormat: Joi.string().required()
    });

    const result = schema.validate(body);

    if (result.error) {
        logger.warning('Validation error', result.error.message);
        throw new InvalidBodyError(undefined, result.error.message);
    }

    return result.value;
}

function validateErrorBody(body: ErrorBody): ErrorBody {
    const schema = Joi.object({
        errorCode: Joi.number().integer().required(),
    });

    const result = schema.validate(body);

    if (result.error) {
        logger.warning('Validation error', result.error.message);
        throw new InvalidBodyError(undefined, result.error.message);
    }

    return result.value;
}

export default function (): Router {
    const router = Router();

    router.get('/', asyncHandler(async (req, res) => {
        const machines = await databaseService.getMachines();
        res.json(machines);
    }));

    router.get('/:id', asyncHandler(async (req, res) => {
        const id = req.params.id;
        const initialConnection = req.query.initialConnection;

        checkPathParam(id, 'id');

        const config = await databaseService.getConfig(id, !!initialConnection);

        if (!config) {
            throw new NotFoundError(`Machine with id "${id}" not found`);
        }

        const timestamp = Date.now();
        const result: InfoResult = {
            paused: config.paused,
            backup: config.backup,
            pxFormat: config.pxFormat,
            resolution: config.resolution,
            hours: config.hours,
            timestamp: '' + timestamp
        };

        res.json(result);
    }));

    router.get('/:id/errors', asyncHandler(async (req, res) => {
        const id = req.params.id;
        checkPathParam(id, 'id');

        const result = await databaseService.getErrors(id);
        res.json(result);
    }));

    router.get('/:id/frontend', asyncHandler(async (req, res) => {
        const id = req.params.id;
        checkPathParam(id, 'id');

        const config = await databaseService.getConfigFrontend(id);

        if (!config) {
            throw new NotFoundError(`Machine with id "${id}" not found`);
        }

        delete (config as any)._id;

        res.json(config);
    }));

    router.post('/:id', asyncHandler(async (req, res) => {
        const id = req.params.id;
        const body = req.body;

        checkPathParam(id, 'id');
        const validatedBody = validateConfigBody(body);

        await databaseService.postConfig(id, validatedBody);

        res.json();
    }));

    router.post('/:id/errors', asyncHandler(async (req, res) => {
        const id = req.params.id;
        const body = req.body;

        checkPathParam(id, 'id');
        const validatedBody = validateErrorBody(body);

        await databaseService.postErrorLog(id, validatedBody);

        res.json();
    }));



    router.post('/:id/image', asyncHandler(async (req, res) => {
        const id = req.params.id;
        checkPathParam(id, 'id');

        const image = Buffer.from(req.body.image, 'base64');
        await filesystemService.saveStored(image as any, `${new Date().toISOString()}.jpg`, `${id}`);
        
        res.json();
    }));

    router.get('/:id/images', asyncHandler(async (req, res) => {
        const id = req.params.id;
        checkPathParam(id, 'id');

        const paths = filesystemService.listImages(`${id}`).map(el => `/stored/${id}/${el}`);
        
        res.json(paths);
    }));


    return router;
}
