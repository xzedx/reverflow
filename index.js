"use strict";

const oneAfterOne = (fns) => fns.reduce((last, fn) => last.then(fn), Promise.resolve());

const execTask = (task, input, rollback) =>
        /* well behaived tasks accept two arguments while normals function accept zero or one */
        task.length === 2 ? task(input, true) : Promise.resolve(input).then(task).then((result) => [result, null]);


const execSerial = (tasks, input) =>
        tasks.reduce(
            (promise, task) =>
                promise.then(
                    ([result, rollbacks]) =>
                        execTask(task, result).then(
                            ([result, rollback]) =>
                                [result, rollback ? [rollback].concat(rollbacks) : rollbacks],
                            (err) =>
                                Promise.reject([err, rollbacks]))), Promise.resolve([input, []]))
        .then(
            ([result, rollbacks]) =>
                [result, rollbacks.length && (() => oneAfterOne(rollbacks))],
            ([err, rollbacks]) =>
                oneAfterOne(rollbacks).then(() => Promise.reject(err)));

exports.serial = function serial (...tasks) {
    tasks = tasks.length === 1 && Array.isArray(tasks[0]) ? tasks[0] : tasks;
    return (input, internalcall) =>
        execSerial(tasks, input).then(result => internalcall ? result : result[0]);
};


const execConcurrent = (tasks, input) =>
        Promise.all(tasks.map(
            task => execTask(task, input).catch(err => [null, null, err])))
        .then(
            results => [
                results.map(([result]) => result),
                () => Promise.all(results.filter(([_result, rollback]) => rollback).map(
                    ([_result, rollback])=> rollback())),
                results.find(([_result, _rollback, err]) => err)])
        .then(
            ([result, rollback, err]) =>
                err ? rollback().then(()=> Promise.reject(err)) : [result, rollback]);

exports.concurrent = function concurrent (...tasks) {
    tasks = tasks.length === 1 && Array.isArray(tasks[0]) ? tasks[0] : tasks;
    return (input, internalcall) =>
        execConcurrent(tasks, input).then((result => internalcall ? result : result[0]));
};

const execRollbackable = (task, rollback, input) =>
        execTask(task, input).then(
            ([result, _rollback]) =>
                [result, () => Promise.resolve(result).then(rollback).then(_rollback)]);

exports.rollbackable = (task, rollback) => (input, internalcall) =>
    execRollbackable(task, rollback, input).then((result => internalcall ? result : result[0]));
